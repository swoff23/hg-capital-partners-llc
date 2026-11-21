"use server";
import { ListingStatus } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import * as properties from "@/lib/properties/service";
import { staffPrincipal } from "@/lib/tasks/service";
import { LOCKBOX_LOCATION_MAX } from "@/lib/property-types";
import { readSignUp, toWaitlistRow, type RemovedWaitlistEntry, type WaitlistRow } from "@/lib/waitlist/fields";
import * as waitlist from "@/lib/waitlist/service";

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

/* ---------------- Whole-blob editors (return an ActionResult) ---------------- */

const unitSchema = z.object({
  id: z.string().max(100).nullish(),
  label: z.string().nullish(),
  lockboxCode: z.string().nullish(),
  lockboxLocation: z.string().max(LOCKBOX_LOCATION_MAX).nullish(),
  // Checked against the property's lockbox folder by the save (service.ts cleanLockboxPhoto).
  lockboxPhoto: z
    .object({
      pathname: z.string().min(1).max(400),
      thumbPathname: z.string().max(400).nullish(),
      width: z.number().nullish(),
      height: z.number().nullish(),
    })
    .nullish(),
  lockboxShared: z.boolean().optional(),
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
  status: z.enum(ListingStatus),
  photos: z.array(z.object({ url: z.string(), pathname: z.string() })).max(20),
});

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
export async function deletePropertyListing(
  propertyId: string,
  listingId: string,
  expectedVersion: string,
  expectedWaiting = 0,
): Promise<ActionResult> {
  return withResult("deletePropertyListing", async () => {
    const me = await requireUser();
    await properties.deleteListing(propertyId, z.string().min(1).parse(listingId), expectedVersion, me, z.number().int().min(0).parse(expectedWaiting));
  });
}

/* ---------------- A listing's sign-up list (docs/specs/coming-soon.md 3.5) ---------------- */

const entryId = z.string().min(1).max(40);

/** Remove from list, at once. The row as it was, for the toast's Undo; null when it was already gone. */
export async function removeWaitlistEntry(propertyId: string, id: string): Promise<ActionResult<RemovedWaitlistEntry | null>> {
  return withResult("removeWaitlistEntry", async () => {
    await requireUser();
    return waitlist.remove(z.string().min(1).parse(propertyId), entryId.parse(id));
  });
}

// What removeWaitlistEntry returned, read again by the sign-up form's rules before it goes back.
const removedEntrySchema = z
  .object({
    id: entryId,
    listingId: z.string().min(1).max(40),
    firstName: z.string().max(500),
    email: z.string().max(500),
    phone: z.string().max(500).nullable(),
    createdAt: z.iso.datetime(),
  })
  .transform((v, ctx): RemovedWaitlistEntry => {
    const read = readSignUp({ firstName: v.firstName, email: v.email, phone: v.phone ?? "" });
    if (read.ok) return { ...v, ...read.data };
    for (const [field, message] of Object.entries(read.problems)) ctx.addIssue({ code: "custom", path: [field], message });
    return z.NEVER;
  });

/** The toast's Undo after Remove: the row back on its listing with its id and the day it signed up. */
export async function restoreWaitlistEntry(propertyId: string, entry: unknown): Promise<ActionResult<WaitlistRow>> {
  return withResult("restoreWaitlistEntry", async () => {
    await requireUser();
    return toWaitlistRow(await waitlist.restore(z.string().min(1).parse(propertyId), removedEntrySchema.parse(entry)));
  });
}

/**
 * Archive the property, or with `archived` false restore it: its page's ⋯
 * menu, its Archived line, and the toast's Undo for either.
 */
export async function setPropertyArchived(id: string, archived: boolean): Promise<ActionResult> {
  return withResult("setPropertyArchived", async () => {
    const user = await requireUser();
    await properties.setPropertyArchive(z.string().min(1).parse(id), z.boolean().parse(archived), user);
  });
}
