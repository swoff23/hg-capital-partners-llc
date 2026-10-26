import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { ListingStatus, Prisma, Property } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FieldError } from "@/lib/action-result";
import { splitAddress } from "@/lib/address-suggestions";
import { NUMBER_MESSAGE, readNumber } from "@/lib/money";
import { badNumbersMessage, readAmount, readRate, readWholeNumber } from "@/lib/properties/numbers";
import { fmtDay, ymdToDate } from "@/lib/dates";
import { sameStreetAddress, streetKey } from "@/lib/normalize";
import {
  countUnitRecords,
  parseBuildingCapex,
  parseUnits,
  reconcileUnits,
  renamedLabel,
  withUnitIds,
  type BuildingCapexEntry,
  type PropertyUnit,
} from "@/lib/property-types";
import { rowConflict, isAtVersion, staleFields } from "@/lib/properties/edits";
import { cancelOpenAutoTask, renameTaskUnits, revalidateTasks, upsertAutoTask, type Principal as TaskPrincipal } from "@/lib/tasks/service";

/**
 * Property domain: every write to Property / PropertyAttachment / Listing
 * goes through here. Server actions authenticate + parse and call in.
 *
 * Rules that live here:
 *   - an address with an existing property's house number and street is a
 *     duplicate, when a property is made and when one is renamed (the rename
 *     is refused on the address field, forms 2.6)
 *   - money fields parse through one parser; dates are calendar dates
 *   - editing a key date re-syncs that property's reminder tasks
 *   - a field save is refused when a field it changes moved after the
 *     editor loaded it (edits.ts)
 *   - whole-blob saves (units, building CapEx, listings) are guarded by the
 *     Property.updatedAt the editor pinned when Edit opened
 *   - every write records who made it (`updatedByUserId`), so a refusal can
 *     say "Pieter changed this at 2:14 PM" (forms 2.12)
 */

/**
 * Who is writing: the signed-in user. Required on every write, so a caller
 * that forgets it is a type error; an import passes `null` to leave the last
 * editor as it was.
 */
export type Editor = { id: string } | null;

const stamp = (by: Editor) => (by ? { updatedByUserId: by.id } : {});

function revalidateProperty(id: string): void {
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

/* ---------------- Optimistic concurrency ---------------- */

/**
 * The refusal for a save that lost to a newer one: reads the row as it is
 * now, so the line can say who saved and when (and, for a field save, what
 * the fields hold now).
 */
async function conflictOf(
  id: string,
  fields: string[],
  opts: { values?: boolean; db?: Pick<typeof prisma, "property"> } = {},
): Promise<Error> {
  // Inside a transaction the read goes through it: a second connection would wait on the one the transaction holds.
  const row = await (opts.db ?? prisma).property.findUnique({
    where: { id },
    include: { updatedByUser: { select: { name: true, email: true } } },
  });
  if (!row) return new Error("This property is gone.");
  return rowConflict(row, fields, opts);
}

function versionDate(expectedVersion: string): Date | null {
  const d = new Date(expectedVersion);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function updateAtVersion(
  id: string,
  expectedVersion: string,
  field: string,
  data: Parameters<typeof prisma.property.updateMany>[0]["data"],
  by: Editor,
): Promise<void> {
  const version = versionDate(expectedVersion);
  const r = version ? await prisma.property.updateMany({ where: { id, updatedAt: version }, data: { ...data, ...stamp(by) } }) : { count: 0 };
  if (r.count === 0) throw await conflictOf(id, [field]);
}

/* ---------------- Create ---------------- */

/**
 * The existing property this address would duplicate, or null: the same house
 * number and street however it was typed (`sameStreetAddress`, the test the
 * address field's "is already a property" line runs). `excludeId` leaves out
 * the property being renamed, so it isn't its own duplicate.
 */
export async function findDuplicateProperty(address: string, opts: { excludeId?: string } = {}): Promise<Property | null> {
  const lead = streetKey(address).split(" ")[0];
  if (!lead) return null;
  const candidates = await prisma.property.findMany({
    where: { address: { contains: lead, mode: "insensitive" }, ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return candidates.find((p) => sameStreetAddress(p.address, address)) ?? null;
}

export interface NewProperty {
  address: string;
  llcOwner?: string | null;
  status?: string | null;
}

export async function createProperty(
  input: NewProperty,
  by: Editor,
): Promise<{ property: Property; duplicateOf?: undefined } | { property?: undefined; duplicateOf: Property }> {
  const duplicateOf = await findDuplicateProperty(input.address);
  if (duplicateOf) return { duplicateOf };
  const property = await prisma.property.create({
    data: { address: input.address.trim(), llcOwner: input.llcOwner || null, status: input.status || null, ...stamp(by) },
  });
  revalidatePath("/properties");
  return { property };
}

/* ---------------- Scalar details ---------------- */

const TEXT_FIELDS = [
  "llcOwner", "attorney", "status", "strategy", "notes",
  "lender", "loanServicer", "loanNumber", "loanType", "refiTarget",
  "insuranceCarrier", "insurancePolicyNo", "insuranceLiability",
] as const;
const MONEY_FIELDS = [
  "value", "replacementCost", "purchasePrice", "closingCosts", "rehabAmount", "rehabMonths",
  "loanOriginalAmount", "currentLoan", "loanRate", "loanPaymentMonthly",
  "insuranceCoverage", "insuranceDeductible", "insurancePremium",
] as const;
const DATE_FIELDS = [
  "purchaseDate", "refinanceDate", "loanOriginationDate", "loanMaturityDate", "insuranceRenewalDate",
  "propertyTaxDueDate", "rentalRegistrationExpiry",
] as const;

/** Key-date fields that, when edited, trigger a reminder-task resync. */
const KEY_DATE_FIELDS = [
  "loanMaturityDate",
  "insuranceRenewalDate",
  "propertyTaxDueDate",
  "rentalRegistrationExpiry",
] as const;

/**
 * A field present in the patch is written; its value null clears it. Field
 * names are whitelisted here, so a form can post whatever it likes.
 */
export type PropertyPatch = Partial<Record<string, string | null>>;

/**
 * `expected` holds, for each field the editor changed, the value it loaded
 * (edits.ts changedFields). A field whose stored value has moved off that
 * was saved by someone else meanwhile, and then nothing is written.
 */
export async function patchProperty(
  id: string,
  patch: PropertyPatch,
  expected: Record<string, string> = {},
  by: Editor,
): Promise<void> {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  const s = (k: string) => patch[k]?.trim() || null;

  const data: Record<string, unknown> = {};
  const bad: string[] = [];
  if (has("address") && s("address")) data.address = s("address");
  for (const k of TEXT_FIELDS) if (has(k)) data[k] = s(k);
  for (const k of MONEY_FIELDS) {
    if (!has(k)) continue;
    const r = k === "loanRate" ? readRate(patch[k]) : readAmount(patch[k]);
    if (r.ok) data[k] = r.value;
    else bad.push(k);
  }
  for (const k of DATE_FIELDS) if (has(k)) data[k] = ymdToDate(s(k));
  if (has("loanEscrow")) data.loanEscrow = s("loanEscrow") === "yes";
  if (has("sqft")) {
    const r = readWholeNumber(patch.sqft);
    if (r.ok) data.sqft = r.value;
    else bad.push("sqft");
  }
  // Nothing is written when a number didn't read: storing null would erase what's there.
  if (bad.length) throw new Error(badNumbersMessage(bad));

  // A rename onto an address another property has is refused on the address field, like New property's.
  if (typeof data.address === "string") {
    const stored = await prisma.property.findUnique({ where: { id }, select: { address: true } });
    if (stored && stored.address !== data.address) {
      const duplicateOf = await findDuplicateProperty(data.address, { excludeId: id });
      if (duplicateOf) throw new FieldError({ address: `${splitAddress(duplicateOf.address).street} is already a property.` });
    }
  }

  const guarded = Object.keys(expected).filter((k) => k in data);
  if (guarded.length > 0) {
    const current = await prisma.property.findUnique({ where: { id }, include: { updatedByUser: { select: { name: true, email: true } } } });
    if (!current) throw new Error("This property is gone.");
    const edits = {
      changes: Object.fromEntries(guarded.map((k) => [k, patch[k] ?? ""])),
      expected: Object.fromEntries(guarded.map((k) => [k, expected[k]])),
    };
    const stale = staleFields(current, edits);
    if (stale.length > 0) throw rowConflict(current, stale, { values: true });
    // At the version just read, so a save that lands in between is refused too.
    const r = await prisma.property.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { ...data, ...stamp(by) } });
    if (r.count === 0) throw await conflictOf(id, guarded, { values: true });
  } else if (Object.keys(data).length > 0) {
    await prisma.property.update({ where: { id }, data: { ...data, ...stamp(by) } });
  }
  if (KEY_DATE_FIELDS.some((k) => has(k))) await syncPropertyReminders(id);
  revalidateProperty(id);
}

/* ---------------- Auto key-date reminders ---------------- */

type ReminderDef = {
  slug: string;
  field: (typeof KEY_DATE_FIELDS)[number];
  leadDays: number;
  title: (d: Date) => string;
};

const REMINDERS: ReminderDef[] = [
  { slug: "loanMaturity", field: "loanMaturityDate", leadDays: 60, title: (d) => `Refinance or extend the loan maturing ${fmtDay(d)}` },
  { slug: "insuranceRenewal", field: "insuranceRenewalDate", leadDays: 30, title: (d) => `Confirm coverage before insurance renews ${fmtDay(d)}` },
  { slug: "propertyTax", field: "propertyTaxDueDate", leadDays: 21, title: (d) => `Property tax due ${fmtDay(d)}` },
  { slug: "rentalRegistration", field: "rentalRegistrationExpiry", leadDays: 30, title: (d) => `Renew the rental registration expiring ${fmtDay(d)}` },
];

/**
 * Idempotently keep one reminder Task per key date, due `leadDays` before it.
 * Keyed on `Task.autoKey` (`<propertyId>:<slug>`). Re-running only rewrites the
 * title + due date — never the status or assignee. A cleared date drops its
 * still-open reminder.
 */
export async function syncPropertyReminders(propertyId: string): Promise<void> {
  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { loanMaturityDate: true, insuranceRenewalDate: true, propertyTaxDueDate: true, rentalRegistrationExpiry: true },
  });
  if (!p) return;
  for (const r of REMINDERS) {
    const autoKey = `${propertyId}:${r.slug}`;
    const date = p[r.field];
    if (date) await upsertAutoTask(autoKey, propertyId, r.title(date), new Date(date.getTime() - r.leadDays * 86_400_000));
    else await cancelOpenAutoTask(autoKey);
  }
  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath(`/properties/${propertyId}`);
}

/* ---------------- Documents (files in Vercel Blob) ---------------- */

export interface AttachmentInput {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
}

export async function recordPropertyAttachment(propertyId: string, data: AttachmentInput): Promise<void> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) return;
  await prisma.propertyAttachment.create({
    data: {
      propertyId,
      url: data.url,
      pathname: data.pathname,
      filename: data.filename.slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(data.size)),
      contentType: data.contentType,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
}

export async function deletePropertyAttachment(attachmentId: string): Promise<void> {
  const att = await prisma.propertyAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  try {
    await del(att.url);
  } catch {
    // Blob already gone / token missing — still drop the DB row.
  }
  await prisma.propertyAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/properties/${att.propertyId}`);
}

/* ---------------- Units (JSON, whole-array replace) ---------------- */

/** A rename can touch every task at the property; Prisma's 5s default is tight for that. */
const TX_LIMITS = { timeout: 20_000, maxWait: 10_000 };

/**
 * Save the whole units list. Each unit keeps a stable id (reconcileUnits),
 * so a renamed unit is told apart from a removed one and an added one: the
 * property's tasks and listings, which name a unit by its label, follow the
 * rename in the same transaction (G2C-001).
 */
export async function replaceUnits(
  id: string,
  units: PropertyUnit[],
  expectedVersion: string,
  p: TaskPrincipal,
  by: Editor,
): Promise<void> {
  await writeUnits(id, expectedVersion, p, by, () => units);
}

/**
 * Save one unit from its sheet (forms 4.2): the stored list with this unit
 * replaced, or added at the end when it has no id yet. Still the version the
 * sheet opened at, so a change anyone else made to the property meanwhile
 * refuses it, and a rename reaches the tasks and listings that name the unit.
 */
export async function saveUnit(id: string, unit: PropertyUnit, expectedVersion: string, p: TaskPrincipal, by: Editor): Promise<void> {
  await writeUnits(id, expectedVersion, p, by, (stored) =>
    unit.id && stored.some((u) => u.id === unit.id) ? stored.map((u) => (u.id === unit.id ? unit : u)) : [...stored, unit],
  );
}

/** Delete one unit by its id, from its row's menu after the confirm (forms 4.2). A unit already gone is not an error. */
export async function deleteUnit(id: string, unitId: string, expectedVersion: string, p: TaskPrincipal, by: Editor): Promise<void> {
  await writeUnits(id, expectedVersion, p, by, (stored) => stored.filter((u) => u.id !== unitId));
}

/**
 * The one write to the units list: `next` turns what's stored into what
 * should be, inside the transaction and at the version the editor pinned.
 */
async function writeUnits(
  id: string,
  expectedVersion: string,
  p: TaskPrincipal,
  by: Editor,
  next: (stored: PropertyUnit[]) => PropertyUnit[],
): Promise<void> {
  const renamed = await prisma.$transaction(async (tx) => {
    const current = await tx.property.findUnique({
      where: { id },
      select: { units: true, unitCount: true, updatedAt: true, updatedByUser: { select: { name: true, email: true } } },
    });
    if (!current) throw new Error("This property is gone.");
    if (!isAtVersion(current.updatedAt, expectedVersion)) throw rowConflict(current, ["units"]);
    const before = parseUnits(current.units);
    // With ids, placeholders included, as the page showed them to the editor.
    const clean: PropertyUnit[] = next(withUnitIds(before)).map((u) => ({
      id: u.id?.trim() || null,
      label: u.label?.trim() || null,
      lockboxCode: u.lockboxCode?.trim() || null,
      utilities: Object.fromEntries(Object.entries(u.utilities ?? {}).map(([k, v]) => [k, v?.trim() || null])),
      equipment: (u.equipment ?? [])
        .filter((e) => e.type && (e.model || e.installYear || e.comment))
        .map((e) => ({
          type: e.type.trim(),
          model: e.model?.trim() || null,
          installYear: e.installYear?.trim() || null,
          comment: e.comment?.trim() || null,
        })),
    }));
    const { units: stored, renames } = reconcileUnits(before, clean, randomUUID);
    // The count is the unit records (propertyUnitCount); store it so the column never disagrees.
    const unitCount = countUnitRecords(stored) || null;
    const r = await tx.property.updateMany({
      where: { id, updatedAt: current.updatedAt },
      data: { units: stored as unknown as object, unitCount, ...stamp(by) },
    });
    if (r.count === 0) throw await conflictOf(id, ["units"], { db: tx });
    const countChanged = unitCount !== current.unitCount;
    if (renames.length === 0) return { listings: 0, tasks: [], countChanged };
    // Listings name their unit by label too. Each is matched against the old labels, so a swap swaps.
    const listings = await tx.listing.findMany({ where: { propertyId: id }, select: { id: true, unitLabel: true } });
    let listingCount = 0;
    for (const l of listings) {
      const to = renamedLabel(renames, l.unitLabel);
      if (!to) continue;
      await tx.listing.update({ where: { id: l.id }, data: { unitLabel: to } });
      listingCount++;
    }
    return { listings: listingCount, tasks: await renameTaskUnits(tx, id, renames, p), countChanged };
  }, TX_LIMITS);
  revalidatePath(`/properties/${id}`);
  if (renamed.countChanged) revalidatePath("/properties");
  if (renamed.listings) revalidatePath("/rentals");
  revalidateTasks(renamed.tasks);
}

/* ---------------- Building CapEx (JSON, merge by key) ---------------- */

export type BuildingCapexPatch = Record<string, { year?: string | null; type?: string | null; costOverride?: number | null }>;

/**
 * Merge per-system entries into what's stored. Keys the payload doesn't
 * mention are left untouched (data for a system removed from the global
 * rules stays put and reappears if re-added); a key sent with everything
 * blank is an explicit clear.
 */
export async function mergeBuildingCapex(id: string, patch: BuildingCapexPatch, expectedVersion: string, by: Editor): Promise<void> {
  const current = await prisma.property.findUnique({
    where: { id },
    select: { buildingCapex: true, updatedAt: true, updatedByUser: { select: { name: true, email: true } } },
  });
  if (!current) throw new Error("This property is gone.");
  if (!isAtVersion(current.updatedAt, expectedVersion)) throw rowConflict(current, ["buildingCapex"]);

  const clean: Record<string, BuildingCapexEntry> = { ...(parseBuildingCapex(current.buildingCapex) as Record<string, BuildingCapexEntry>) };
  for (const [key, v] of Object.entries(patch)) {
    const year = v.year?.trim() || null;
    // "Old" as a year used to save and then drop the system out of the forecast (PROPERTY-022).
    if (year && !readNumber("year", year).ok) throw new FieldError({ [`${key}.year`]: NUMBER_MESSAGE.year });
    const type = v.type?.trim() || null;
    const costOverride =
      v.costOverride != null && Number.isFinite(v.costOverride) && v.costOverride > 0 ? Math.round(v.costOverride) : null;
    if (year || type || costOverride != null) clean[key] = { year, type, costOverride };
    else delete clean[key];
  }
  await updateAtVersion(id, expectedVersion, "buildingCapex", { buildingCapex: clean as unknown as object }, by);
  revalidateProperty(id);
}

/* ---------------- Listings (real rows, whole-set replace) ---------------- */

export interface ListingInput {
  id: string | null;
  unitLabel: string;
  zillowUrl: string;
  rent: string;
  beds: string;
  baths: string;
  sqft: string;
  availableDate: string;
  status: ListingStatus;
  photos: { url: string; pathname: string }[];
}

/**
 * Diff the submitted set against what's stored: missing rows are deleted
 * (photos too), existing ids updated in place, new rows created. Runs in one
 * transaction that also bumps Property.updatedAt (the version guard);
 * orphaned photo blobs are deleted only after the commit.
 */
export async function replaceListings(propertyId: string, listings: ListingInput[], expectedVersion: string, by: Editor): Promise<void> {
  const clean = listings.map(cleanListing);

  const existing = await prisma.listing.findMany({ where: { propertyId }, select: { id: true, photos: { select: { url: true } } } });
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const keepIds = new Set(clean.map((l) => l.id).filter(Boolean) as string[]);
  const toDelete = existing.filter((e) => !keepIds.has(e.id));

  const urlsToDelete: string[] = [];
  for (const row of toDelete) urlsToDelete.push(...row.photos.map((p) => p.url));
  for (const l of clean) {
    if (!l.id) continue;
    const before = existingById.get(l.id);
    if (!before) continue;
    const afterUrls = new Set(l.photos.map((p) => p.url));
    for (const p of before.photos) if (!afterUrls.has(p.url)) urlsToDelete.push(p.url);
  }

  await prisma.$transaction(async (tx) => {
    await touchAtVersion(tx, propertyId, expectedVersion, by);
    for (const row of toDelete) await tx.listing.delete({ where: { id: row.id } });
    for (const { photos, ...l } of clean) {
      if (l.id) {
        await tx.listing.update({
          where: { id: l.id },
          data: { ...l, id: undefined, propertyId, photos: { deleteMany: {}, create: photos } },
        });
      } else {
        await tx.listing.create({ data: { ...l, id: undefined, propertyId, photos: { create: photos } } });
      }
    }
  });

  await deleteBlobs(urlsToDelete);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}

/**
 * Save one listing from its sheet (forms 4.2): the fields and the photo set
 * together, in one transaction that also moves the property's version on. At
 * the version the sheet opened at, so a change anyone else made to the
 * property meanwhile refuses it. Photos that left the set are deleted after
 * the commit. Returns the listing's id.
 */
export async function saveListing(propertyId: string, listing: ListingInput, expectedVersion: string, by: Editor): Promise<{ id: string }> {
  const { photos, ...l } = cleanListing(listing);
  const before = l.id
    ? await prisma.listing.findFirst({ where: { id: l.id, propertyId }, select: { photos: { select: { url: true } } } })
    : null;
  if (l.id && !before) throw new Error("This listing was deleted.");
  const kept = new Set(photos.map((p) => p.url));
  const orphaned = (before?.photos ?? []).map((p) => p.url).filter((url) => !kept.has(url));

  const id = await prisma.$transaction(async (tx) => {
    await touchAtVersion(tx, propertyId, expectedVersion, by);
    if (l.id) {
      await tx.listing.update({ where: { id: l.id }, data: { ...l, id: undefined, propertyId, photos: { deleteMany: {}, create: photos } } });
      return l.id;
    }
    const created = await tx.listing.create({ data: { ...l, id: undefined, propertyId, photos: { create: photos } }, select: { id: true } });
    return created.id;
  });

  await deleteBlobs(orphaned);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
  return { id };
}

/** Delete one listing and its photos, after the confirm (forms 4.2). A listing already gone is not an error. */
export async function deleteListing(propertyId: string, listingId: string, expectedVersion: string, by: Editor): Promise<void> {
  const row = await prisma.listing.findFirst({ where: { id: listingId, propertyId }, select: { photos: { select: { url: true } } } });
  await prisma.$transaction(async (tx) => {
    await touchAtVersion(tx, propertyId, expectedVersion, by);
    if (row) await tx.listing.delete({ where: { id: listingId } });
  });
  await deleteBlobs((row?.photos ?? []).map((p) => p.url));
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}

/**
 * What a listing writes, read from what the sheet sent: a blank unit is
 * "Unit", rent and square feet must read as numbers (a blank clears), and
 * the photo set keeps its order. A number that doesn't read is a refusal on
 * that field, in the words of the field kit.
 */
function cleanListing(l: ListingInput) {
  const rent = readAmount(l.rent);
  const sqft = readWholeNumber(l.sqft);
  const problems: Record<string, string> = {};
  if (!rent.ok) problems.rent = "Enter an amount, like 1,500.";
  if (!sqft.ok) problems.sqft = NUMBER_MESSAGE.integer;
  if (Object.keys(problems).length > 0) throw new FieldError(problems);
  return {
    id: l.id ?? null,
    unitLabel: l.unitLabel.trim() || "Unit",
    zillowUrl: l.zillowUrl.trim() || null,
    rent: rent.ok ? rent.value : null,
    beds: l.beds.trim() || null,
    baths: l.baths.trim() || null,
    sqft: sqft.ok ? sqft.value : null,
    availableDate: ymdToDate(l.availableDate.trim() || null),
    status: l.status,
    photos: l.photos
      .filter((p) => p.url.trim() && p.pathname.trim())
      .map((p, sortOrder) => ({ url: p.url.trim(), pathname: p.pathname.trim(), sortOrder })),
  };
}

/** Moves the property's version on inside a listing write, and refuses it when the editor's version is no longer current. */
async function touchAtVersion(tx: Prisma.TransactionClient, propertyId: string, expectedVersion: string, by: Editor): Promise<void> {
  const version = versionDate(expectedVersion);
  const touched = version
    ? await tx.property.updateMany({ where: { id: propertyId, updatedAt: version }, data: { updatedAt: new Date(), ...stamp(by) } })
    : { count: 0 };
  if (touched.count === 0) throw await conflictOf(propertyId, ["listings"], { db: tx });
}

/** Photo files that left a listing. A file already gone, or no token, isn't an error: the row is gone regardless. */
async function deleteBlobs(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      await del(url);
    } catch {
      // Blob already gone / token missing.
    }
  }
}
