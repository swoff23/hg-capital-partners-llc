"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { MAX_FILENAME } from "@/lib/attachments/content-types";
import { assertQueueOwner, portalScope } from "@/lib/attachments/queue-owner";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { recordContactDocument, removeContactDocument, saveDetails, saveInsuranceStep, saveTrades, saveW9Step } from "@/lib/portal/setup";
import { withResult } from "@/lib/server-action";

/**
 * The setup steps' saves (docs/specs/contractor-onboarding.md, section 3): each checks who's calling, parses, and
 * calls the portal setup service (src/lib/portal/setup.ts), which holds every rule. A result, not a throw, so a
 * refusal shows on its field.
 */

const id = z.string().min(1).max(64);
const owner = z.string().max(80).nullish();
const docKind = z.enum(["w9", "insurance"]);

const detailsSchema = z
  .object({ fullName: z.string().max(200), company: z.string().max(200), phone: z.string().max(60), mailingAddress: z.string().max(500) })
  .strict();

const tradesSchema = z
  .object({ tradeIds: z.array(id).max(60), note: z.string().max(400), tenantFixes: z.boolean().nullable() })
  .strict();

// Where the browser put the file and what to call it, never its URL, size or type: the service reads those from Blob.
// The queue sends display hints along too; a contractor's paperwork keeps none of them.
const recordedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(MAX_FILENAME * 4),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
    queuedAt: z.string().nullish(),
  })
  .strict();

export async function saveDetailsAction(input: z.input<typeof detailsSchema>): Promise<ActionResult<{ done: boolean }>> {
  return withResult("portal:saveSetupDetails", async () => {
    const p = await requirePortalPrincipal();
    return saveDetails(p.contactId, detailsSchema.parse(input));
  });
}

export async function saveTradesAction(input: z.input<typeof tradesSchema>): Promise<ActionResult<{ done: boolean }>> {
  return withResult("portal:saveSetupTrades", async () => {
    const p = await requirePortalPrincipal();
    return saveTrades(p.contactId, tradesSchema.parse(input));
  });
}

export async function saveW9Action(): Promise<ActionResult<{ done: boolean }>> {
  return withResult("portal:saveSetupW9", async () => {
    const p = await requirePortalPrincipal();
    return saveW9Step(p.contactId);
  });
}

export async function saveInsuranceAction(input: { noInsurance: boolean }): Promise<ActionResult<{ done: boolean }>> {
  return withResult("portal:saveSetupInsurance", async () => {
    const p = await requirePortalPrincipal();
    return saveInsuranceStep(p.contactId, { noInsurance: z.object({ noInsurance: z.boolean() }).strict().parse(input).noInsurance });
  });
}

/** After the browser finished uploading straight to Blob: records the W-9 or the policy on the signed-in contractor. */
export async function recordSetupDocumentAction(
  kind: "w9" | "insurance",
  file: z.input<typeof recordedSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("portal:recordSetupDocument", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    const { pathname, filename } = recordedSchema.parse(file);
    return recordContactDocument(p.contactId, docKind.parse(kind), { pathname, filename });
  });
}

/** Takes one of the contractor's own files off their record, before setup is finished. */
export async function removeSetupDocumentAction(documentId: string): Promise<ActionResult> {
  return withResult("portal:removeSetupDocument", async () => {
    const p = await requirePortalPrincipal();
    await removeContactDocument(p.contactId, id.parse(documentId));
  });
}
