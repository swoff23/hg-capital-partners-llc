"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import * as properties from "@/lib/properties/service";

/**
 * Thin server actions: authenticate, validate, call the property service,
 * redirect. Everything that touches the database lives in
 * src/lib/properties/service.ts.
 */

const propertySchema = z.object({
  address: z.string().min(4),
  llcOwner: z.string().optional(),
  status: z.string().optional(),
});

export async function createProperty(formData: FormData) {
  return withLog("createProperty", async () => {
    await requireUser();
    const p = propertySchema.parse(formToObject(formData));
    const r = await properties.createProperty(p);
    if (r.duplicateOf) redirect(`/properties/${r.duplicateOf.id}?dup=1`);
    redirect(`/properties/${r.property.id}`);
  });
}

/** Every field the form posts is written; "" clears. Unknown names are ignored by the service. */
function formToPatch(formData: FormData): properties.PropertyPatch {
  const patch: properties.PropertyPatch = {};
  for (const [k, v] of formData.entries()) patch[k] = typeof v === "string" ? v : null;
  return patch;
}

/** Edit the property's scalar detail fields (details, loan, insurance, notes, inline address). */
export async function patchProperty(id: string, formData: FormData) {
  return withLog("patchProperty", async () => {
    await requireUser();
    await properties.patchProperty(id, formToPatch(formData));
  });
}

export async function syncPropertyReminders(propertyId: string) {
  return withLog("syncPropertyReminders", async () => {
    await requireUser();
    await properties.syncPropertyReminders(propertyId);
  });
}

/* ---------------- Documents (files in Vercel Blob) ---------------- */

export async function recordPropertyAttachment(propertyId: string, data: properties.AttachmentInput) {
  return withLog("recordPropertyAttachment", async () => {
    await requireUser();
    await properties.recordPropertyAttachment(propertyId, data);
  });
}

export async function deletePropertyAttachment(attachmentId: string) {
  return withLog("deletePropertyAttachment", async () => {
    await requireUser();
    await properties.deletePropertyAttachment(attachmentId);
  });
}

/* ---------------- Whole-blob editors (return an ActionResult) ---------------- */

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

export async function updatePropertyUnits(id: string, units: unknown, expectedVersion: string): Promise<ActionResult> {
  return withResult("updatePropertyUnits", async () => {
    await requireUser();
    await properties.replaceUnits(id, z.array(unitSchema).parse(units), expectedVersion);
  });
}

const buildingCapexSchema = z.record(
  z.string(),
  z.object({ year: z.string().nullish(), type: z.string().nullish(), costOverride: z.number().nullish() }),
);

export async function updateBuildingCapex(id: string, data: unknown, expectedVersion: string): Promise<ActionResult> {
  return withResult("updateBuildingCapex", async () => {
    await requireUser();
    await properties.mergeBuildingCapex(id, buildingCapexSchema.parse(data), expectedVersion);
  });
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

export async function updatePropertyListings(
  propertyId: string,
  listings: unknown,
  expectedVersion: string,
): Promise<ActionResult> {
  return withResult("updatePropertyListings", async () => {
    await requireUser();
    const parsed = z.array(listingSchema).parse(listings).map((l) => ({ ...l, id: l.id ?? null }));
    await properties.replaceListings(propertyId, parsed, expectedVersion);
  });
}
