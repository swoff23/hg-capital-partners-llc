import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { Prisma, Property } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FieldError } from "@/lib/action-result";
import { duplicateSentence, liveFirst, splitAddress } from "@/lib/address-suggestions";
import { NUMBER_MESSAGE, readNumber } from "@/lib/money";
import { ROOMS_LIMIT, SQFT_LIMIT, amountLimit, badNumbersMessage, readAmount, readRate, readWholeNumber } from "@/lib/properties/numbers";
import { entityName } from "@/lib/properties/entity";
import { cleanListing, type ListingInput } from "@/lib/properties/listing-clean";
import { fmtDay, todayYmdEastern, ymdToDate } from "@/lib/dates";
import { sameStreetAddress, streetKey } from "@/lib/normalize";
import { containsText } from "@/lib/search";
import {
  LOCKBOX_LOCATION_MAX,
  applySharedLockbox,
  isHouseMeterRow,
  parseBuildingCapex,
  parseUnits,
  withUnitIds,
  type BuildingCapexEntry,
  type LockboxPhoto,
  type PropertyUnit,
} from "@/lib/property-types";
import { discardLockboxUploads, isLockboxPhotoPath } from "@/lib/properties/photo";
import { rowConflict, isAtVersion, onConflict, staleFields } from "@/lib/properties/edits";
import { writeUnitsTx } from "@/lib/properties/units-write";
import { setPropertyArchived } from "@/lib/archive";
import { linkProperty } from "@/lib/deals/property-link";
import { logError } from "@/lib/log";
import { cancelOpenAutoTask, revalidateTasks, upsertAutoTask, type Principal as TaskPrincipal } from "@/lib/tasks/service";

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
 *     say "Pieter changed this at 2:14 PM" (forms 2.12), or "You changed
 *     this at 2:14 PM." when the newer save was the caller's own
 *   - archive and restore (lib/archive.ts) record who did it; an archived
 *     property leaves Portfolio, its totals, Home, search, the pickers and
 *     the move-in form, and its tasks keep working
 *   - a new property links to its Closed deal when exactly one matches
 *     (lib/deals/property-link.ts), with a line in that deal's log
 *   - a renamed unit's tasks, listings and leases follow it, and a unit with
 *     current or upcoming tenants can't be deleted (units-write.ts)
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
 * the fields hold now). `by` is who is saving: when the newer save was their
 * own, the line says "You changed this" (edits.ts `rowConflict`).
 */
async function conflictOf(
  id: string,
  fields: string[],
  by: Editor,
  opts: { values?: boolean; db?: Pick<typeof prisma, "property"> } = {},
): Promise<Error> {
  // Inside a transaction the read goes through it: a second connection would wait on the one the transaction holds.
  const row = await (opts.db ?? prisma).property.findUnique({
    where: { id },
    include: { updatedByUser: { select: { name: true, email: true } } },
  });
  if (!row) return new Error("This property is gone.");
  return rowConflict(row, fields, { values: opts.values, actorId: by?.id });
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
  if (r.count === 0) throw await conflictOf(id, [field], by);
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
    where: { address: containsText(lead), ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return liveFirst(candidates.filter((p) => sameStreetAddress(p.address, address)));
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
    data: { address: input.address.trim(), llcOwner: entityName(input.llcOwner), status: input.status || null, ...stamp(by) },
  });
  await linkToDeal(property.id, by);
  revalidatePath("/properties");
  return { property };
}

/**
 * Links a property just added to its Closed deal, when exactly one matches
 * (lib/deals/property-link.ts), and writes "Linked to 118 Congress St." in
 * that deal's log. The property is saved by now, so a failure here is logged
 * and never fails that save; the two stay unlinked, as before this existed.
 */
async function linkToDeal(id: string, by: Editor): Promise<void> {
  try {
    const linked = await prisma.$transaction((tx) => linkProperty(tx, id, by));
    // The deal's page gains its "Converted to" line and its log the new line.
    if (linked) {
      revalidatePath(`/deals/${linked.dealId}`);
      revalidatePath("/deals");
    }
  } catch (err) {
    logError("properties:link-deal", err, { propertyId: id });
  }
}

/* ---------------- Scalar details ---------------- */

// Refi target, closing costs, rehab amount and strategy left the page (docs/specs/property-page.md):
// their columns keep what they hold, and nothing writes them any more.

const TEXT_FIELDS = [
  "llcOwner", "attorney", "status", "notes",
  "lender", "loanServicer", "loanNumber", "loanType",
  "insuranceCarrier", "insurancePolicyNo", "insuranceLiability",
] as const;
const MONEY_FIELDS = [
  "value", "replacementCost", "purchasePrice", "rehabMonths", "baths",
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
  // Read as numbers but past what the column holds: refused with the limit, where the database used to fail.
  const tooLarge: string[] = [];
  if (has("address") && s("address")) data.address = s("address");
  for (const k of TEXT_FIELDS) if (has(k)) data[k] = s(k);
  for (const k of MONEY_FIELDS) {
    if (!has(k)) continue;
    const r = k === "loanRate" ? readRate(patch[k]) : readAmount(patch[k], amountLimit(k));
    if (r.ok) data[k] = r.value;
    else {
      bad.push(k);
      if (r.tooLarge) tooLarge.push(k);
    }
  }
  for (const k of DATE_FIELDS) if (has(k)) data[k] = ymdToDate(s(k));
  if (has("loanEscrow")) data.loanEscrow = s("loanEscrow") === "yes";
  if (has("showOnMoveInForm")) data.showOnMoveInForm = s("showOnMoveInForm") === "yes";
  for (const [k, limit] of [["sqft", SQFT_LIMIT], ["beds", ROOMS_LIMIT]] as const) {
    if (!has(k)) continue;
    const r = readWholeNumber(patch[k], limit);
    if (r.ok) data[k] = r.value;
    else {
      bad.push(k);
      if (r.tooLarge) tooLarge.push(k);
    }
  }
  // Nothing is written when a number didn't read: storing null would erase what's there.
  if (bad.length) throw new Error(badNumbersMessage(bad, tooLarge));

  // Entity: a QuickBooks company in its own spelling, or a new name as typed (lib/properties/entity.ts).
  if (has("llcOwner")) data.llcOwner = entityName(patch.llcOwner);

  // A rename onto an address another property has is refused on the address field, like New property's.
  if (typeof data.address === "string") {
    const stored = await prisma.property.findUnique({ where: { id }, select: { address: true } });
    if (stored && stored.address !== data.address) {
      const duplicateOf = await findDuplicateProperty(data.address, { excludeId: id });
      if (duplicateOf) throw new FieldError({ address: duplicateSentence("property", splitAddress(duplicateOf.address).street, duplicateOf.archivedAt !== null) });
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
    if (stale.length > 0) throw rowConflict(current, stale, { values: true, actorId: by?.id });
    // At the version just read, so a save that lands in between is refused too.
    const r = await prisma.property.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { ...data, ...stamp(by) } });
    if (r.count === 0) throw await conflictOf(id, guarded, by, { values: true });
  } else if (Object.keys(data).length > 0) {
    await prisma.property.update({ where: { id }, data: { ...data, ...stamp(by) } });
  }
  if (KEY_DATE_FIELDS.some((k) => has(k))) await syncPropertyReminders(id);
  revalidateProperty(id);
}

/* ---------------- Archive ---------------- */

/**
 * Archive the property (`archived` true) or restore it, from its page's ⋯
 * menu, its Archived line or the toast's Undo. Home's Needs you, the task
 * pickers and filters, and the move-in form read it too.
 */
export async function setPropertyArchive(id: string, archived: boolean, by: { id: string }): Promise<void> {
  await prisma.$transaction((tx) => setPropertyArchived(tx, id, archived, by));
  revalidateProperty(id);
  revalidatePath("/");
  revalidatePath("/tasks", "layout");
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

/* Documents (files in Vercel Blob) live in ./documents (build plan 1.3). */

/* ---------------- Units (JSON, whole-array replace) ---------------- */

/** A rename can touch every task at the property; Prisma's 5s default is tight for that. */
const TX_LIMITS = { timeout: 20_000, maxWait: 10_000 };

/**
 * Save the whole units list. Each unit keeps a stable id (reconcileUnits),
 * so a renamed unit is told apart from a removed one and an added one: the
 * property's tasks and listings, which name a unit by its label, follow the
 * rename in the same transaction (G2C-001), and so do its leases, by the
 * unit's id. A list without a unit that has current or upcoming tenants is
 * refused (units-write.ts).
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
  await writeUnits(id, expectedVersion, p, by, (stored) => {
    const at = unit.id ? stored.findIndex((u) => u.id === unit.id) : -1;
    const next = at >= 0 ? stored.map((u, i) => (i === at ? unit : u)) : [...stored, unit];
    // "Same lockbox for all units" (docs/specs/lockbox-location.md, decision 4b): on, the others take this unit's
    // lockbox; newly off, each keeps its own.
    return applySharedLockbox(next, at >= 0 ? at : next.length - 1);
  });
}

/**
 * Delete one unit by its id, from its row's menu after the confirm (forms 4.2). A unit already gone is not an error.
 * One with current or upcoming tenants is refused: "Front has current tenants. End their lease first."
 */
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
  // Refused as stale, the page comes back on the latest with the refusal: the row behind the sheet never keeps a code that was changed.
  await onConflict(() => writeUnitsAt(id, expectedVersion, p, by, next), () => revalidatePath(`/properties/${id}`));
}

async function writeUnitsAt(
  id: string,
  expectedVersion: string,
  p: TaskPrincipal,
  by: Editor,
  next: (stored: PropertyUnit[]) => PropertyUnit[],
): Promise<void> {
  // The write itself, and the tasks, listings and leases that follow it, are units-write.ts, where a database test reaches them.
  const written = await prisma.$transaction(
    (tx) => writeUnitsTx(tx, id, expectedVersion, p, by, (stored) => cleanUnits(id, stored, next(stored)), { today: todayYmdEastern() }),
    TX_LIMITS,
  );
  // Best effort, after the save landed: a file that fails to delete is only clutter in Blob, which no unit points at.
  if (written.dropped.length > 0) {
    await discardLockboxUploads(id, written.dropped).catch((err: unknown) => logError("properties:lockbox-photo:discard", err, { propertyId: id }, { level: "warning" }));
  }
  revalidatePath(`/properties/${id}`);
  if (written.countChanged) revalidatePath("/properties");
  if (written.listings) revalidatePath("/rentals");
  revalidateTasks(written.tasks);
  // A lease's unit label shows on the Tenants list and its own page.
  if (written.leases.length > 0) {
    revalidatePath("/tenants", "layout");
    for (const leaseId of written.leases) revalidatePath(`/tenants/${leaseId}`);
  }
}

/**
 * What the editor sent, as the units list keeps it: every field trimmed, and
 * a lockbox photo only from this property's folder. `stored` is the list as
 * the editor saw it, ids included, for what an edit doesn't send.
 */
function cleanUnits(propertyId: string, stored: readonly PropertyUnit[], edited: readonly PropertyUnit[]): PropertyUnit[] {
  // A unit's Vacant since (Missing info, D6) isn't on the unit sheet, so an edit that doesn't send it keeps what's stored.
  const vacant = new Map(stored.map((u) => [u.id, u.vacantSince ?? null]));
  return edited.map((u) => ({
    id: u.id?.trim() || null,
    label: u.label?.trim() || null,
    lockboxCode: u.lockboxCode?.trim() || null,
    ...vacantField(u.vacantSince === undefined ? vacant.get(u.id) : u.vacantSince),
    lockboxLocation: u.lockboxLocation?.trim().slice(0, LOCKBOX_LOCATION_MAX) || null,
    lockboxPhoto: cleanLockboxPhoto(propertyId, u.lockboxPhoto),
    ...(u.lockboxShared === true && !isHouseMeterRow(u) ? { lockboxShared: true } : {}),
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
}

/** A unit's Vacant since, stored only while it's set, so a unit with none keeps the shape it always had. */
const vacantField = (v: string | null | undefined) => (v?.trim() ? { vacantSince: v.trim() } : {});

/**
 * Change one unit from Missing info (docs/specs/missing-info.md): a utility
 * status answered in place (D4), or Mark vacant (D6). The worklist has no
 * version to pin, so this writes at the row's latest; a save that lands in
 * between still refuses it, as any stale write is refused. `unitId` may be a
 * placeholder ("unit-at-2"), which names the same unit as the page showed it.
 */
export async function changeUnit(
  id: string,
  unitId: string,
  change: (u: PropertyUnit) => PropertyUnit,
  p: TaskPrincipal,
  by: Editor,
): Promise<void> {
  const row = await prisma.property.findUnique({ where: { id }, select: { updatedAt: true, units: true } });
  if (!row) throw new Error("This property is gone.");
  if (!withUnitIds(parseUnits(row.units)).some((u) => u.id === unitId)) throw new Error("That unit is gone. Reload to see the latest.");
  await writeUnits(id, row.updatedAt.toISOString(), p, by, (stored) => stored.map((u) => (u.id === unitId ? change(u) : u)));
}

/**
 * Give every unit of the property a lasting id, for a check that has to name
 * one (a skip, Mark vacant). Returns the units as stored after, in the same
 * order, so a placeholder ("unit-at-2") still finds its unit by its place.
 */
export async function ensureUnitIds(id: string, p: TaskPrincipal, by: Editor): Promise<PropertyUnit[]> {
  const row = await prisma.property.findUnique({ where: { id }, select: { updatedAt: true, units: true } });
  if (!row) throw new Error("This property is gone.");
  const units = parseUnits(row.units);
  if (units.every((u) => u.id)) return units;
  await writeUnits(id, row.updatedAt.toISOString(), p, by, (stored) => stored);
  const after = await prisma.property.findUnique({ where: { id }, select: { units: true } });
  return parseUnits(after?.units);
}

/**
 * A unit's lockbox photo as the save keeps it: only files inside this
 * property's lockbox folder (photo.ts isLockboxPhotoPath), so a stale or
 * forged pathname can never point a unit at someone else's file. A bad
 * thumbnail is dropped and the photo kept.
 */
function cleanLockboxPhoto(propertyId: string, photo: LockboxPhoto | null | undefined): LockboxPhoto | null {
  if (!photo?.pathname || !isLockboxPhotoPath(propertyId, photo.pathname)) return null;
  const thumb = photo.thumbPathname && isLockboxPhotoPath(propertyId, photo.thumbPathname) ? photo.thumbPathname : null;
  const size = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null);
  return { pathname: photo.pathname, thumbPathname: thumb, width: size(photo.width), height: size(photo.height) };
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
  await onConflict(() => writeBuildingCapex(id, patch, expectedVersion, by), () => revalidatePath(`/properties/${id}`));
}

async function writeBuildingCapex(id: string, patch: BuildingCapexPatch, expectedVersion: string, by: Editor): Promise<void> {
  const current = await prisma.property.findUnique({
    where: { id },
    select: { buildingCapex: true, updatedAt: true, updatedByUserId: true, updatedByUser: { select: { name: true, email: true } } },
  });
  if (!current) throw new Error("This property is gone.");
  if (!isAtVersion(current.updatedAt, expectedVersion)) throw rowConflict(current, ["buildingCapex"], { actorId: by?.id });

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

/* ---------------- Listings (real rows, one at a time from its sheet) ---------------- */

// What a listing write reads from the sheet is in listing-clean.ts, where a test can reach it.
export type { ListingInput };

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
export async function deleteListing(
  propertyId: string,
  listingId: string,
  expectedVersion: string,
  by: Editor,
  /** How many people the confirm said were waiting. Sign-ups don't move the version, so more now means the list grew. */
  expectedWaiting = 0,
): Promise<void> {
  const row = await prisma.listing.findFirst({ where: { id: listingId, propertyId }, select: { photos: { select: { url: true } } } });
  await prisma.$transaction(async (tx) => {
    await touchAtVersion(tx, propertyId, expectedVersion, by);
    if (!row) return;
    // The list goes with the listing: refuse when people signed up after the confirm was read.
    const waiting = await tx.listingWaitlistEntry.count({ where: { listingId } });
    if (waiting > expectedWaiting) {
      revalidatePath(`/properties/${propertyId}`);
      throw new Error("Someone just signed up for this home. Check the list, then delete again.");
    }
    await tx.listing.delete({ where: { id: listingId } });
  });
  await deleteBlobs((row?.photos ?? []).map((p) => p.url));
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}

/** Moves the property's version on inside a listing write, and refuses it when the editor's version is no longer current. */
async function touchAtVersion(tx: Prisma.TransactionClient, propertyId: string, expectedVersion: string, by: Editor): Promise<void> {
  const version = versionDate(expectedVersion);
  const touched = version
    ? await tx.property.updateMany({ where: { id: propertyId, updatedAt: version }, data: { updatedAt: new Date(), ...stamp(by) } })
    : { count: 0 };
  if (touched.count === 0) {
    // The refused sheet's page comes back on the latest with the refusal.
    revalidatePath(`/properties/${propertyId}`);
    throw await conflictOf(propertyId, ["listings"], by, { db: tx });
  }
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
