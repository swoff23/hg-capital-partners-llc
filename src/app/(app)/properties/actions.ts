"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import * as properties from "@/lib/properties/service";
import { staffPrincipal } from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the property service.
 * Everything that touches the database lives in src/lib/properties/service.ts.
 * New property's create is `properties/new/actions.ts`.
 */

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
    const user = await requireUser();
    await properties.patchProperty(id, fieldsSchema.parse(changes), fieldsSchema.parse(expected), user);
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
    await properties.replaceUnits(id, z.array(unitSchema).parse(units), expectedVersion, staffPrincipal(me), me);
  });
}

/** One unit from its sheet: replaces it, or adds it when it has no id yet. At the version the sheet opened at. */
export async function savePropertyUnit(id: string, unit: unknown, expectedVersion: string): Promise<ActionResult> {
  return withResult("savePropertyUnit", async () => {
    const me = await requireUser();
    await properties.saveUnit(id, unitSchema.parse(unit), expectedVersion, staffPrincipal(me), me);
  });
}

/** One unit, after the confirm. */
export async function deletePropertyUnit(id: string, unitId: string, expectedVersion: string): Promise<ActionResult> {
  return withResult("deletePropertyUnit", async () => {
    const me = await requireUser();
    await properties.deleteUnit(id, z.string().min(1).max(100).parse(unitId), expectedVersion, staffPrincipal(me), me);
  });
}

const buildingCapexSchema = z.record(
  z.string(),
  z.object({ year: z.string().nullish(), type: z.string().nullish(), costOverride: z.number().nullish() }),
);

export async function updateBuildingCapex(id: string, data: unknown, expectedVersion: string): Promise<ActionResult> {
  return withResult("updateBuildingCapex", async () => {
    const me = await requireUser();
    await properties.mergeBuildingCapex(id, buildingCapexSchema.parse(data), expectedVersion, me);
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
    const me = await requireUser();
    const parsed = z.array(listingSchema).parse(listings).map((l) => ({ ...l, id: l.id ?? null }));
    await properties.replaceListings(propertyId, parsed, expectedVersion, me);
  });
}

/** One listing from its sheet, fields and photos together. Returns its id, so a new listing is known once saved. */
export async function savePropertyListing(
  propertyId: string,
  listing: unknown,
  expectedVersion: string,
): Promise<ActionResult<{ id: string }>> {
  return withResult("savePropertyListing", async () => {
    const me = await requireUser();
    const parsed = listingSchema.parse(listing);
    return properties.saveListing(propertyId, { ...parsed, id: parsed.id ?? null }, expectedVersion, me);
  });
}

/** One listing and its photos, after the confirm. */
export async function deletePropertyListing(propertyId: string, listingId: string, expectedVersion: string): Promise<ActionResult> {
  return withResult("deletePropertyListing", async () => {
    const me = await requireUser();
    await properties.deleteListing(propertyId, z.string().min(1).parse(listingId), expectedVersion, me);
  });
}
