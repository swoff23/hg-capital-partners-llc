"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { PropertyUnit } from "@/lib/property-types";

function decOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[$,\s]/g, "");
  const mult = /k$/.test(s) ? 1e3 : /m$/.test(s) ? 1e6 : 1;
  const num = s.replace(/[km]$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(num)) return null;
  return (parseFloat(num) * mult).toFixed(2);
}

/** Edit the property's scalar detail fields. Form always submits every field ("" = clear). */
export async function patchProperty(id: string, formData: FormData) {
  await requireUser();
  const s = (k: string) => formData.get(k)?.toString().trim() || null;
  const has = (k: string) => formData.has(k);

  const data: Record<string, unknown> = {};
  if (has("address") && s("address")) data.address = s("address");
  if (has("llcOwner")) data.llcOwner = s("llcOwner");
  if (has("refiTarget")) data.refiTarget = s("refiTarget");
  if (has("attorney")) data.attorney = s("attorney");
  if (has("lender")) data.lender = s("lender");
  if (has("loanServicer")) data.loanServicer = s("loanServicer");
  if (has("status")) data.status = s("status");
  if (has("strategy")) data.strategy = s("strategy");
  if (has("notes")) data.notes = s("notes");
  if (has("purchaseDate")) data.purchaseDate = s("purchaseDate") ? new Date(s("purchaseDate")!) : null;
  if (has("refinanceDate")) data.refinanceDate = s("refinanceDate") ? new Date(s("refinanceDate")!) : null;
  if (has("purchasePrice")) data.purchasePrice = decOrNull(s("purchasePrice"));
  if (has("currentLoan")) data.currentLoan = decOrNull(s("currentLoan"));
  if (has("value")) data.value = decOrNull(s("value"));
  if (has("rehabAmount")) data.rehabAmount = decOrNull(s("rehabAmount"));
  if (has("sqft")) data.sqft = s("sqft") ? parseInt(s("sqft")!.replace(/\D/g, ""), 10) || null : null;
  if (has("unitCount")) data.unitCount = s("unitCount") ? parseInt(s("unitCount")!, 10) || null : null;

  await prisma.property.update({ where: { id }, data });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
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
    costOverride: z.number().nullish(),
  }),
);

/** Replace the whole building-level CapEx map (year + optional cost override per system). */
export async function updateBuildingCapex(id: string, data: unknown) {
  await requireUser();
  const parsed = buildingCapexSchema.parse(data);
  const clean: Record<string, { year: string | null; costOverride: number | null }> = {};
  for (const [key, v] of Object.entries(parsed)) {
    const year = v.year?.trim() || null;
    const costOverride =
      v.costOverride != null && Number.isFinite(v.costOverride) && v.costOverride > 0
        ? Math.round(v.costOverride)
        : null;
    if (year || costOverride != null) clean[key] = { year, costOverride };
  }
  await prisma.property.update({
    where: { id },
    data: { buildingCapex: clean as unknown as object },
  });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}
