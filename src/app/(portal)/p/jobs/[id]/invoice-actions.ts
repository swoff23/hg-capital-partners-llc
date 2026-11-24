"use server";
import { z } from "zod";
import { FieldError, type ActionResult } from "@/lib/action-result";
import { MAX_FILENAME } from "@/lib/attachments/content-types";
import { invoiceSendParent, storedInvoiceUploadPath } from "@/lib/attachments/limits";
import { assertQueueOwner, portalScope } from "@/lib/attachments/queue-owner";
import { JOB_NOT_FINISHED, NOT_IN_FOLDER, NO_JOB_ACCESS, SIGN_IN_TO_SEND } from "@/lib/invoices/core";
import { readTotal } from "@/lib/invoices/fields";
import { jobInvoicesForContractor, type PortalInvoiceRow } from "@/lib/invoices/queries";
import * as invoices from "@/lib/invoices/service";
import { requirePortalPrincipal, type PortalPrincipal } from "@/lib/portal/session";
import { withResult } from "@/lib/server-action";

/**
 * Send invoice's two actions (docs/contractor-invoices-plan.md, 4.1). Check who's calling, parse, call the invoices
 * service; who may send, from which job and in which status is src/lib/invoices/core.ts's (sendRefusal), so a link
 * session and a job that isn't finished come back as its line and nothing is written.
 *
 * Each names the upload queue's owner, as the job page's other uploads do (upload-actions.ts): a tab still showing
 * Zack's job after Mike signs in elsewhere is refused instead of sending as Mike.
 */

const id = z.string().min(1).max(64);
const owner = z.string().max(80).nullish();

const fileSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    // A long name from an older tab is cut by the check, not refused here with its bytes already up.
    filename: z.string().min(1).max(MAX_FILENAME * 4),
    // The uploader also sends the display hints and queue time with each file; an invoice keeps none of them.
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
    queuedAt: z.string().nullish(),
  });

const sendSchema = z
  .object({
    // Typed text: the server reads the total strictly (readTotal) and the number is cleaned by the service.
    invoiceNumber: z.string().max(200).nullable(),
    total: z.string().max(40).nullable(),
    files: z.array(z.object({ pathname: z.string().min(1).max(300), filename: z.string().min(1).max(MAX_FILENAME * 4) }).strict()).min(1, "Add the invoice file.").max(20, "Send up to 20 files at a time."),
  })
  .strict();

function contractor(p: PortalPrincipal) {
  return { kind: "contractor" as const, contactId: p.contactId, label: p.label, onlyTaskId: p.onlyTaskId };
}

/**
 * The record step for a file the browser just put in the contractor's own folder on the job. Nothing is kept yet: the
 * invoice doesn't exist until Send, which records every file at once. This only checks the file is where Send will
 * look for it and that this contractor may send from this job now, so a refusal shows on the tile while they can still
 * fix it. The answer's id is the path, which is what the sheet holds and Send names.
 */
export async function recordInvoiceFileAction(
  taskId: string,
  file: z.input<typeof fileSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }> & { final?: true }> {
  const res = await withResult("portal:recordInvoiceFile", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    const { pathname } = fileSchema.parse(file);
    const task = id.parse(taskId);
    if (!storedInvoiceUploadPath("portal-invoice-upload", pathname, invoiceSendParent(task, p.contactId))) throw new FieldError({ files: NOT_IN_FOLDER });
    const refusal = await invoices.sendRefusal(task, contractor(p));
    if (refusal) throw new FieldError({ invoice: refusal });
    return { id: pathname };
  });
  // The job stopped taking invoices (or never did): no Retry changes it, so the tile keeps only Remove.
  const final = !res.ok && [NO_JOB_ACCESS, JOB_NOT_FINISHED, SIGN_IN_TO_SEND].includes(res.error);
  return final ? { ...res, final: true } : res;
}

/** The invoice as it now shows on the job, for the sent screen: what the Invoices section will list. */
export type SentInvoice = Pick<PortalInvoiceRow, "id" | "title" | "invoiceNumber" | "totalCents" | "stage" | "stageWord" | "sentOn" | "dateWord">;

/**
 * Send invoice. The files are the ones the sheet holds, by path; the service checks each blob again (it's in this
 * contractor's folder, a PDF or a photo, not already on an invoice) and hashes it. The answer is the new invoice as
 * the job page lists it, Received, so the sent screen shows what the page will.
 */
export async function sendInvoiceAction(taskId: string, input: z.input<typeof sendSchema>, queueOwner?: string | null): Promise<ActionResult<SentInvoice>> {
  return withResult("portal:sendInvoice", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    const task = id.parse(taskId);
    const { invoiceNumber, total, files } = sendSchema.parse(input);
    const read = readTotal(total);
    if (!read.ok) throw new FieldError({ total: read.message });
    const made = await invoices.sendPortalInvoice({ taskId: task, invoiceNumber, totalCents: read.cents, files }, contractor(p));
    const row = (await jobInvoicesForContractor({ contactId: p.contactId, onlyTaskId: p.onlyTaskId }, task)).find((r) => r.id === made.id);
    if (!row) throw new Error("The new invoice isn't listed on its job");
    const { id: rowId, title, invoiceNumber: number, totalCents, stage, stageWord, sentOn, dateWord } = row;
    return { id: rowId, title, invoiceNumber: number, totalCents, stage, stageWord, sentOn, dateWord };
  });
}
