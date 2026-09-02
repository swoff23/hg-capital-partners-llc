import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { ListingStatus, Property } from "@prisma/client";
import { prisma } from "@/lib/db";
import { amountToDecimal } from "@/lib/money";
import { fmtDay, ymdToDate } from "@/lib/dates";
import { normalizeAddress } from "@/lib/normalize";
import { parseBuildingCapex, type BuildingCapexEntry, type PropertyUnit } from "@/lib/property-types";
import { CONFLICT_MESSAGE } from "@/lib/action-result";
import { deleteOpenAutoTask, upsertAutoTask } from "@/lib/tasks/service";

/**
 * Property domain: every write to Property / PropertyAttachment / Listing
 * goes through here. Server actions authenticate + parse and call in.
 *
 * Rules that live here:
 *   - an address that normalizes to an existing property's is a duplicate
 *   - money fields parse through one parser; dates are calendar dates
 *   - editing a key date re-syncs that property's reminder tasks
 *   - whole-blob saves (units, building CapEx, listings) are guarded by the
 *     Property.updatedAt the editor rendered with
 */

function revalidateProperty(id: string): void {
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

/* ---------------- Optimistic concurrency ---------------- */

function versionDate(expectedVersion: string): Date {
  const d = new Date(expectedVersion);
  if (Number.isNaN(d.getTime())) throw new Error(CONFLICT_MESSAGE);
  return d;
}

async function updateAtVersion(
  id: string,
  expectedVersion: string,
  data: Parameters<typeof prisma.property.updateMany>[0]["data"],
): Promise<void> {
  const r = await prisma.property.updateMany({ where: { id, updatedAt: versionDate(expectedVersion) }, data });
  if (r.count === 0) throw new Error(CONFLICT_MESSAGE);
}

/* ---------------- Create ---------------- */

export async function findDuplicateProperty(address: string): Promise<Property | null> {
  const dup = await prisma.property.findFirst({
    where: { address: { contains: address.split(",")[0].trim(), mode: "insensitive" } },
  });
  return dup && normalizeAddress(dup.address) === normalizeAddress(address) ? dup : null;
}

export interface NewProperty {
  address: string;
  llcOwner?: string | null;
  status?: string | null;
}

export async function createProperty(
  input: NewProperty,
): Promise<{ property: Property; duplicateOf?: undefined } | { property?: undefined; duplicateOf: Property }> {
  const duplicateOf = await findDuplicateProperty(input.address);
  if (duplicateOf) return { duplicateOf };
  const property = await prisma.property.create({
    data: { address: input.address.trim(), llcOwner: input.llcOwner || null, status: input.status || null },
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

export async function patchProperty(id: string, patch: PropertyPatch): Promise<void> {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  const s = (k: string) => patch[k]?.trim() || null;

  const data: Record<string, unknown> = {};
  if (has("address") && s("address")) data.address = s("address");
  for (const k of TEXT_FIELDS) if (has(k)) data[k] = s(k);
  for (const k of MONEY_FIELDS) if (has(k)) data[k] = amountToDecimal(s(k));
  for (const k of DATE_FIELDS) if (has(k)) data[k] = ymdToDate(s(k));
  if (has("sqft")) data.sqft = s("sqft") ? parseInt(s("sqft")!.replace(/\D/g, ""), 10) || null : null;

  if (Object.keys(data).length > 0) await prisma.property.update({ where: { id }, data });
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
  { slug: "loanMaturity", field: "loanMaturityDate", leadDays: 60, title: (d) => `Loan maturity ${fmtDay(d)} — refinance or extend` },
  { slug: "insuranceRenewal", field: "insuranceRenewalDate", leadDays: 30, title: (d) => `Insurance renews ${fmtDay(d)} — confirm coverage` },
  { slug: "propertyTax", field: "propertyTaxDueDate", leadDays: 21, title: (d) => `Property tax due ${fmtDay(d)}` },
  { slug: "rentalRegistration", field: "rentalRegistrationExpiry", leadDays: 30, title: (d) => `Rental registration expires ${fmtDay(d)} — renew` },
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
    else await deleteOpenAutoTask(autoKey);
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

export async function replaceUnits(id: string, units: PropertyUnit[], expectedVersion: string): Promise<void> {
  const clean: PropertyUnit[] = units.map((u) => ({
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
  await updateAtVersion(id, expectedVersion, { units: clean as unknown as object });
  revalidatePath(`/properties/${id}`);
}

/* ---------------- Building CapEx (JSON, merge by key) ---------------- */

export type BuildingCapexPatch = Record<string, { year?: string | null; type?: string | null; costOverride?: number | null }>;

/**
 * Merge per-system entries into what's stored. Keys the payload doesn't
 * mention are left untouched (data for a system removed from the global
 * rules stays put and reappears if re-added); a key sent with everything
 * blank is an explicit clear.
 */
export async function mergeBuildingCapex(id: string, patch: BuildingCapexPatch, expectedVersion: string): Promise<void> {
  const current = await prisma.property.findUnique({ where: { id }, select: { buildingCapex: true, updatedAt: true } });
  if (!current || current.updatedAt.getTime() !== versionDate(expectedVersion).getTime()) throw new Error(CONFLICT_MESSAGE);

  const clean: Record<string, BuildingCapexEntry> = { ...(parseBuildingCapex(current.buildingCapex) as Record<string, BuildingCapexEntry>) };
  for (const [key, v] of Object.entries(patch)) {
    const year = v.year?.trim() || null;
    const type = v.type?.trim() || null;
    const costOverride =
      v.costOverride != null && Number.isFinite(v.costOverride) && v.costOverride > 0 ? Math.round(v.costOverride) : null;
    if (year || type || costOverride != null) clean[key] = { year, type, costOverride };
    else delete clean[key];
  }
  await updateAtVersion(id, expectedVersion, { buildingCapex: clean as unknown as object });
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
export async function replaceListings(propertyId: string, listings: ListingInput[], expectedVersion: string): Promise<void> {
  const clean = listings.map((l) => ({
    id: l.id ?? null,
    unitLabel: l.unitLabel.trim() || "Unit",
    zillowUrl: l.zillowUrl.trim() || null,
    rent: amountToDecimal(l.rent.trim() || null),
    beds: l.beds.trim() || null,
    baths: l.baths.trim() || null,
    sqft: l.sqft.trim() ? Math.max(0, Math.trunc(Number(l.sqft))) || null : null,
    availableDate: ymdToDate(l.availableDate.trim() || null),
    status: l.status,
    photos: l.photos
      .filter((p) => p.url.trim() && p.pathname.trim())
      .map((p, sortOrder) => ({ url: p.url.trim(), pathname: p.pathname.trim(), sortOrder })),
  }));

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
    const touched = await tx.property.updateMany({
      where: { id: propertyId, updatedAt: versionDate(expectedVersion) },
      data: { updatedAt: new Date() },
    });
    if (touched.count === 0) throw new Error(CONFLICT_MESSAGE);
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

  for (const url of urlsToDelete) {
    try {
      await del(url);
    } catch {
      // Blob already gone / token missing — the DB row is gone regardless.
    }
  }

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}
