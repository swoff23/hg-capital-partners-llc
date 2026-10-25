"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import * as properties from "@/lib/properties/service";
import { staffPrincipal } from "@/lib/tasks/service";

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

/** The property an address already belongs to, for the New property form to point at. */
export type ExistingProperty = { id: string; address: string };

/**
 * Creates the property and opens it. When the address is already a property,
 * nothing is saved and that property comes back, so the form keeps what was typed.
 */
export async function createProperty(formData: FormData): Promise<ActionResult<{ duplicateOf: ExistingProperty }>> {
  return withResult("createProperty", async () => {
    await requireUser();
    const p = propertySchema.parse(formToObject(formData));
    const r = await properties.createProperty(p);
    if (r.duplicateOf) return { duplicateOf: { id: r.duplicateOf.id, address: r.duplicateOf.address } };
    redirect(`/properties/${r.property.id}`);
  });
}

const fieldsSchema = z.record(z.string(), z.string());

/**
 * Edit the property's scalar detail fields (details, loan, insurance, notes,
 * inline address). `changes` holds only the fields the editor changed ("" clears
 * one; unknown names are ignored by the service), and `expected` what it loaded
 * for each, so a field someone else saved meanwhile refuses the save. A number
 * that doesn't read comes back as the error, and nothing is saved; the editor
 * keeps what was typed.
 */
export async function patchProperty(
  id: string,
  changes: Record<string, string>,
  expected: Record<string, string>,
): Promise<ActionResult> {
  return withResult("patchProperty", async () => {
    await requireUser();
    await properties.patchProperty(id, fieldsSchema.parse(changes), fieldsSchema.parse(expected));
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
  id: z.string().max(100).nullish(),
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
    const me = await requireUser();
    // Staff, as the actor on any task that follows a unit rename.
    await properties.replaceUnits(id, z.array(unitSchema).parse(units), expectedVersion, staffPrincipal(me));
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
