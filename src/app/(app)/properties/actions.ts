"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/utils";
import { normalizeAddress } from "@/lib/normalize";
import { formToObject } from "@/lib/forms";
import { parseBuildingCapex, type PropertyUnit } from "@/lib/property-types";

function decOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[$,%\s]/g, "");
  const mult = /k$/.test(s) ? 1e3 : /m$/.test(s) ? 1e6 : 1;
  const num = s.replace(/[km]$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(num)) return null;
  return (parseFloat(num) * mult).toFixed(2);
}
const dateOrNull = (v: string | null) => (v ? new Date(v) : null);

/** Key-date fields that, when edited, trigger a reminder-task resync. */
const KEY_DATE_FIELDS = [
  "loanMaturityDate",
  "insuranceRenewalDate",
  "propertyTaxDueDate",
  "rentalRegistrationExpiry",
] as const;

const propertySchema = z.object({
  address: z.string().min(4),
  llcOwner: z.string().optional(),
  status: z.string().optional(),
});

export async function createProperty(formData: FormData) {
  await requireUser();
  const p = propertySchema.parse(formToObject(formData));

  const dup = await prisma.property.findFirst({
    where: { address: { contains: p.address.split(",")[0].trim(), mode: "insensitive" } },
  });
  if (dup && normalizeAddress(dup.address) === normalizeAddress(p.address)) {
    redirect(`/properties/${dup.id}?dup=1`);
  }

  const property = await prisma.property.create({
    data: { address: p.address.trim(), llcOwner: p.llcOwner || null, status: p.status || null },
  });
  revalidatePath("/properties");
  redirect(`/properties/${property.id}`);
}

/** Edit the property's scalar detail fields. Form always submits every field ("" = clear). */
export async function patchProperty(id: string, formData: FormData) {
  await requireUser();
  const s = (k: string) => formData.get(k)?.toString().trim() || null;
  const has = (k: string) => formData.has(k);

  const data: Record<string, unknown> = {};
  // identity / admin
  if (has("address") && s("address")) data.address = s("address");
  if (has("llcOwner")) data.llcOwner = s("llcOwner");
  if (has("attorney")) data.attorney = s("attorney");
  if (has("status")) data.status = s("status");
  if (has("strategy")) data.strategy = s("strategy");
  if (has("notes")) data.notes = s("notes");

  // valuation / acquisition
  if (has("value")) data.value = decOrNull(s("value"));
  if (has("replacementCost")) data.replacementCost = decOrNull(s("replacementCost"));
  if (has("purchaseDate")) data.purchaseDate = dateOrNull(s("purchaseDate"));
  if (has("purchasePrice")) data.purchasePrice = decOrNull(s("purchasePrice"));
  if (has("closingCosts")) data.closingCosts = decOrNull(s("closingCosts"));
  if (has("rehabAmount")) data.rehabAmount = decOrNull(s("rehabAmount"));
  if (has("rehabMonths")) data.rehabMonths = decOrNull(s("rehabMonths"));
  if (has("sqft")) data.sqft = s("sqft") ? parseInt(s("sqft")!.replace(/\D/g, ""), 10) || null : null;

  // loan
  if (has("lender")) data.lender = s("lender");
  if (has("loanServicer")) data.loanServicer = s("loanServicer");
  if (has("loanNumber")) data.loanNumber = s("loanNumber");
  if (has("loanType")) data.loanType = s("loanType");
  if (has("loanOriginalAmount")) data.loanOriginalAmount = decOrNull(s("loanOriginalAmount"));
  if (has("currentLoan")) data.currentLoan = decOrNull(s("currentLoan"));
  if (has("loanRate")) data.loanRate = decOrNull(s("loanRate"));
  if (has("loanPaymentMonthly")) data.loanPaymentMonthly = decOrNull(s("loanPaymentMonthly"));
  if (has("loanOriginationDate")) data.loanOriginationDate = dateOrNull(s("loanOriginationDate"));
  if (has("loanMaturityDate")) data.loanMaturityDate = dateOrNull(s("loanMaturityDate"));
  if (has("refinanceDate")) data.refinanceDate = dateOrNull(s("refinanceDate"));
  if (has("refiTarget")) data.refiTarget = s("refiTarget");

  // insurance
  if (has("insuranceCarrier")) data.insuranceCarrier = s("insuranceCarrier");
  if (has("insurancePolicyNo")) data.insurancePolicyNo = s("insurancePolicyNo");
  if (has("insuranceCoverage")) data.insuranceCoverage = decOrNull(s("insuranceCoverage"));
  if (has("insuranceDeductible")) data.insuranceDeductible = decOrNull(s("insuranceDeductible"));
  if (has("insuranceLiability")) data.insuranceLiability = s("insuranceLiability");
  if (has("insurancePremium")) data.insurancePremium = decOrNull(s("insurancePremium"));
  if (has("insuranceRenewalDate")) data.insuranceRenewalDate = dateOrNull(s("insuranceRenewalDate"));

  // stand-alone key dates
  if (has("propertyTaxDueDate")) data.propertyTaxDueDate = dateOrNull(s("propertyTaxDueDate"));
  if (has("rentalRegistrationExpiry"))
    data.rentalRegistrationExpiry = dateOrNull(s("rentalRegistrationExpiry"));

  await prisma.property.update({ where: { id }, data });

  if (KEY_DATE_FIELDS.some((k) => has(k))) await syncPropertyReminders(id);

  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

/* ---------------- Auto key-date reminders ---------------- */

type ReminderDef = {
  slug: string;
  field: (typeof KEY_DATE_FIELDS)[number];
  leadDays: number;
  title: (d: Date) => string;
};

const REMINDERS: ReminderDef[] = [
  {
    slug: "loanMaturity",
    field: "loanMaturityDate",
    leadDays: 60,
    title: (d) => `Loan maturity ${fmtDate(d)} — refinance or extend`,
  },
  {
    slug: "insuranceRenewal",
    field: "insuranceRenewalDate",
    leadDays: 30,
    title: (d) => `Insurance renews ${fmtDate(d)} — confirm coverage`,
  },
  {
    slug: "propertyTax",
    field: "propertyTaxDueDate",
    leadDays: 21,
    title: (d) => `Property tax due ${fmtDate(d)}`,
  },
  {
    slug: "rentalRegistration",
    field: "rentalRegistrationExpiry",
    leadDays: 30,
    title: (d) => `Rental registration expires ${fmtDate(d)} — renew`,
  },
];

/**
 * Idempotently keep one reminder Task per key date, due `leadDays` before it.
 * Keyed on `Task.autoKey` (`<propertyId>:<slug>`). Re-running only rewrites the
 * title + due date — never the status or assignee — so completed / reassigned
 * reminders are left alone. A cleared date drops its still-open reminder.
 */
export async function syncPropertyReminders(propertyId: string) {
  await requireUser();
  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      loanMaturityDate: true,
      insuranceRenewalDate: true,
      propertyTaxDueDate: true,
      rentalRegistrationExpiry: true,
    },
  });
  if (!p) return;

  for (const r of REMINDERS) {
    const autoKey = `${propertyId}:${r.slug}`;
    const date = p[r.field];
    if (date) {
      const dueDate = new Date(date.getTime() - r.leadDays * 86_400_000);
      await prisma.task.upsert({
        where: { autoKey },
        create: { autoKey, title: r.title(date), dueDate, propertyId, bucket: "Property" },
        update: { title: r.title(date), dueDate },
      });
    } else {
      await prisma.task.deleteMany({ where: { autoKey, status: "OPEN" } });
    }
  }

  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath(`/properties/${propertyId}`);
}

/* ---------------- Documents (files in Vercel Blob) ---------------- */

/** Called by the client after a file finishes uploading to Blob. */
export async function recordPropertyAttachment(
  propertyId: string,
  data: { url: string; pathname: string; filename: string; size: number; contentType: string | null },
) {
  await requireUser();
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
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

export async function deletePropertyAttachment(attachmentId: string) {
  await requireUser();
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

const unitSchema = z.object({
  label: z.string().nullish(),
  lockboxCode: z.string().nullish(),
  utilities: z.record(z.string(), z.string().nullish()).optional(),
  equipment: z
    .array(
      z.object({
        type: z.string(),
        model: z.string().nullish(),
        installYear: z.string().nullish(),
        comment: z.string().nullish(),
      }),
    )
    .optional(),
});

/** Replace the whole per-unit reference array (sent from the client editor). */
export async function updatePropertyUnits(id: string, units: unknown) {
  await requireUser();
  const parsed = z.array(unitSchema).parse(units);
  const clean: PropertyUnit[] = parsed.map((u) => ({
    label: u.label?.trim() || null,
    lockboxCode: u.lockboxCode?.trim() || null,
    utilities: Object.fromEntries(
      Object.entries(u.utilities ?? {}).map(([k, v]) => [k, v?.trim() || null]),
    ),
    equipment: (u.equipment ?? [])
      .filter((e) => e.type && (e.model || e.installYear || e.comment))
      .map((e) => ({
        type: e.type.trim(),
        model: e.model?.trim() || null,
        installYear: e.installYear?.trim() || null,
        comment: e.comment?.trim() || null,
      })),
  }));
  await prisma.property.update({ where: { id }, data: { units: clean as unknown as object } });
  revalidatePath(`/properties/${id}`);
}

const buildingCapexSchema = z.record(
  z.string(),
  z.object({
    year: z.string().nullish(),
    type: z.string().nullish(),
    costOverride: z.number().nullish(),
  }),
);

/**
 * Merge a partial building-level CapEx map (type + year + optional cost override
 * per system) into what's stored. Keys the payload doesn't mention are left
 * untouched — so per-property data for a system that was removed from the global
 * CapEx rules stays put and reappears if the system is re-added. A key the
 * payload sends with everything blank is an explicit clear.
 */
export async function updateBuildingCapex(id: string, data: unknown) {
  await requireUser();
  const parsed = buildingCapexSchema.parse(data);
  const current = await prisma.property.findUnique({
    where: { id },
    select: { buildingCapex: true },
  });
  const clean: Record<string, { year: string | null; type: string | null; costOverride: number | null }> =
    { ...(parseBuildingCapex(current?.buildingCapex) as Record<string, { year: string | null; type: string | null; costOverride: number | null }>) };

  for (const [key, v] of Object.entries(parsed)) {
    const year = v.year?.trim() || null;
    const type = v.type?.trim() || null;
    const costOverride =
      v.costOverride != null && Number.isFinite(v.costOverride) && v.costOverride > 0
        ? Math.round(v.costOverride)
        : null;
    if (year || type || costOverride != null) clean[key] = { year, type, costOverride };
    else delete clean[key];
  }
  await prisma.property.update({
    where: { id },
    data: { buildingCapex: clean as unknown as object },
  });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

const listingSchema = z.object({
  id: z.string().nullish(),
  unitLabel: z.string(),
  zillowUrl: z.string(),
  rent: z.string(),
  beds: z.string(),
  baths: z.string(),
  sqft: z.string(),
  availableDate: z.string(),
  status: z.enum(["AVAILABLE", "LEASED", "HIDDEN"]),
  photos: z.array(z.object({ url: z.string(), pathname: z.string() })).max(20),
});

/**
 * Replace the whole set of listings for a property (sent from the client
 * editor). Unlike units/buildingCapex this is a real table, not a JSON blob —
 * diffed against what's currently stored: rows no longer present are deleted
 * (their blob photos cleaned up too), existing ids are updated in place, new
 * rows (id: null, from "+ Add listing") are created. A listing's photo set is
 * itself full-replace on every save — same convention as the rest of this
 * function — so any photo blob no longer referenced gets deleted too.
 */
export async function updatePropertyListings(propertyId: string, listings: unknown) {
  await requireUser();
  const parsed = z.array(listingSchema).parse(listings);

  const clean = parsed.map((l) => ({
    id: l.id ?? null,
    unitLabel: l.unitLabel.trim() || "Unit",
    zillowUrl: l.zillowUrl.trim() || null,
    rent: decOrNull(l.rent.trim() || null),
    beds: l.beds.trim() || null,
    baths: l.baths.trim() || null,
    sqft: l.sqft.trim() ? Math.max(0, Math.trunc(Number(l.sqft))) || null : null,
    availableDate: dateOrNull(l.availableDate.trim() || null),
    status: l.status,
    photos: l.photos
      .filter((p) => p.url.trim() && p.pathname.trim())
      .map((p, sortOrder) => ({ url: p.url.trim(), pathname: p.pathname.trim(), sortOrder })),
  }));

  const existing = await prisma.listing.findMany({
    where: { propertyId },
    select: { id: true, photos: { select: { url: true } } },
  });
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const keepIds = new Set(clean.map((l) => l.id).filter(Boolean) as string[]);
  const toDelete = existing.filter((e) => !keepIds.has(e.id));

  // Blob URLs to clean up: every photo on a deleted listing, plus any photo
  // dropped from an updated listing's gallery (present before, absent now).
  const urlsToDelete: string[] = [];
  for (const row of toDelete) urlsToDelete.push(...row.photos.map((p) => p.url));
  for (const l of clean) {
    if (!l.id) continue;
    const before = existingById.get(l.id);
    if (!before) continue;
    const afterUrls = new Set(l.photos.map((p) => p.url));
    for (const p of before.photos) if (!afterUrls.has(p.url)) urlsToDelete.push(p.url);
  }
  for (const url of urlsToDelete) {
    try {
      await del(url);
    } catch {
      // Blob already gone / token missing — still drop the DB row.
    }
  }

  await prisma.$transaction([
    ...toDelete.map((row) => prisma.listing.delete({ where: { id: row.id } })),
    ...clean.map(({ photos, ...l }) =>
      l.id
        ? prisma.listing.update({
            where: { id: l.id },
            data: { ...l, id: undefined, propertyId, photos: { deleteMany: {}, create: photos } },
          })
        : prisma.listing.create({
            data: { ...l, id: undefined, propertyId, photos: { create: photos } },
          }),
    ),
  ]);

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}
