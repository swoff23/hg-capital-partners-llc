"use server";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { withLog, withResult } from "@/lib/server-action";
import { MAX_FILENAME } from "@/lib/attachments/content-types";
import { appScope, assertQueueOwner } from "@/lib/attachments/queue-owner";
import { storeLeaseFile } from "@/lib/tenants/files";
import * as tenants from "@/lib/tenants/service";

/**
 * The lease page's writes. Authenticate, check the shape, call the tenant
 * service; the rules (overlapping stays, the one primary, the last tenant)
 * live in src/lib/tenants/core.ts and come back as a FieldError, which
 * withResult turns into the result the sheet or the toast shows.
 */

const id = z.string().min(1);
const text = z.string().max(20_000).nullable();

const leasePatch = z.object({ movesIn: text, movesOut: text, deposit: text, notes: text }).partial().strict();
const tenantPatch = z
  .object({
    fullName: text,
    phone: text,
    email: text,
    notes: text,
  })
  .partial()
  .strict();
const termFields = z
  .object({
    startsOn: text,
    endsOn: text,
    rent: text,
    subsidy: text,
    subsidyFrom: text,
    subsidyContact: text,
    subsidyEmail: text,
  })
  .partial()
  .strict();

/** The lease's own facts: move dates, deposit, notes. */
export async function saveLease(leaseId: string, patch: z.input<typeof leasePatch>): Promise<ActionResult> {
  return withResult("saveLease", async () => {
    await requireUser();
    await tenants.patchLease(id.parse(leaseId), leasePatch.parse(patch));
  });
}

/** A person's details; they read the same on every lease they're on. */
export async function saveTenant(tenantId: string, patch: z.input<typeof tenantPatch>): Promise<ActionResult> {
  return withResult("saveTenant", async () => {
    await requireUser();
    await tenants.patchTenant(id.parse(tenantId), tenantPatch.parse(patch));
  });
}

/** A new person on the lease, or someone already in the app when `tenantId` is given. */
export async function addLeaseTenant(
  leaseId: string,
  pick: { tenantId: string } | { fields: z.input<typeof tenantPatch> },
): Promise<ActionResult<{ tenantId: string }>> {
  return withResult("addLeaseTenant", async () => {
    await requireUser();
    const lease = id.parse(leaseId);
    if ("tenantId" in pick) return tenants.addTenant(lease, { tenantId: id.parse(pick.tenantId) });
    return tenants.addTenant(lease, { new: tenantPatch.parse(pick.fields) });
  });
}

export async function removeLeaseTenant(leaseId: string, tenantId: string): Promise<ActionResult> {
  return withResult("removeLeaseTenant", async () => {
    await requireUser();
    await tenants.removeTenant(id.parse(leaseId), id.parse(tenantId));
  });
}

export async function makeLeasePrimary(leaseId: string, tenantId: string): Promise<ActionResult> {
  return withResult("makeLeasePrimary", async () => {
    await requireUser();
    await tenants.makePrimary(id.parse(leaseId), id.parse(tenantId));
  });
}

/** A new signed term, a renewal or the first one. */
export async function addLeaseTerm(leaseId: string, input: z.input<typeof termFields>): Promise<ActionResult<{ id: string }>> {
  return withResult("addLeaseTerm", async () => {
    await requireUser();
    return tenants.addTerm(id.parse(leaseId), termFields.parse(input));
  });
}

/** One term's rent, split or end date. */
export async function saveLeaseTerm(leaseId: string, termId: string, patch: z.input<typeof termFields>): Promise<ActionResult> {
  return withResult("saveLeaseTerm", async () => {
    await requireUser();
    await tenants.patchTerm(id.parse(leaseId), id.parse(termId), termFields.parse(patch));
  });
}

/** Gone for good, files and all; then back to the Tenants list. */
export async function deleteLeaseAndGo(leaseId: string): Promise<void> {
  return withLog("deleteLease", async () => {
    await requireUser();
    const pathnames = await tenants.deleteLease(id.parse(leaseId));
    const token = getEnv().BLOB_READ_WRITE_TOKEN;
    if (pathnames.length && token) {
      await del(pathnames, { token }).catch((err) =>
        logError("tenants:delete:blobs", err, {
          leaseId,
          count: pathnames.length,
        }),
      );
    }
    redirect("/tenants");
  });
}

// Where the browser put the file and what to call it, never its URL, size or type: the record step reads those from
// Blob. The queue sends display hints along; a signed lease keeps none of them.
const recordedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z
      .string()
      .min(1)
      .max(MAX_FILENAME * 4),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
  })
  .strict();

/** After the browser finished uploading a signed lease straight to Blob: keeps it on the lease, linked to its term. */
export async function recordLeaseFileAction(
  leaseId: string,
  termId: string,
  file: z.input<typeof recordedSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("recordLeaseFile", async () => {
    const user = await requireUser();
    assertQueueOwner(z.string().max(80).nullish().parse(queueOwner), appScope(user.id));
    const { pathname, filename } = recordedSchema.parse(file);
    return storeLeaseFile(id.parse(leaseId), id.parse(termId), { pathname, filename }, user.id);
  });
}
