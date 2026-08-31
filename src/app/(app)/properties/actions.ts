"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/utils";
import type { PropertyUnit } from "@/lib/property-types";

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
  // checkbox is absent from FormData when unchecked — a hidden marker tells us the loan form was submitted
  if (has("loanEscrowPresent")) data.loanEscrow = formData.get("loanEscrow") === "on";

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

const linkSchema = z.object({ label: z.string().nullish(), url: z.string().nullish() });

/** Replace the whole Documents/Links array (label + url) for a property. */
export async function updatePropertyLinks(id: string, links: unknown) {
  await requireUser();
  const parsed = z.array(linkSchema).parse(links);
  const clean = parsed
    .map((l) => ({ label: l.label?.trim() || "", url: l.url?.trim() || "" }))
    .filter((l) => l.url.length > 0);
  await prisma.property.update({
    where: { id },
    data: { links: clean as unknown as object },
  });
  revalidatePath(`/properties/${id}`);
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

/** Replace the whole building-level CapEx map (type + year + optional cost override per system). */
export async function updateBuildingCapex(id: string, data: unknown) {
  await requireUser();
  const parsed = buildingCapexSchema.parse(data);
  const clean: Record<string, { year: string | null; type: string | null; costOverride: number | null }> = {};
  for (const [key, v] of Object.entries(parsed)) {
    const year = v.year?.trim() || null;
    const type = v.type?.trim() || null;
    const costOverride =
      v.costOverride != null && Number.isFinite(v.costOverride) && v.costOverride > 0
        ? Math.round(v.costOverride)
        : null;
    if (year || type || costOverride != null) clean[key] = { year, type, costOverride };
  }
  await prisma.property.update({
    where: { id },
    data: { buildingCapex: clean as unknown as object },
  });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}
