"use server";
import { z } from "zod";
import { FieldError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { appScope, assertQueueOwner } from "@/lib/attachments/queue-owner";
import type { Ymd } from "@/lib/dates";
import { paidToastDetail } from "@/lib/invoices/email-content";
import { readTotal } from "@/lib/invoices/fields";
import * as invoices from "@/lib/invoices/service";
import { withResult } from "@/lib/server-action";

/**
 * The invoice page's writes (docs/contractor-invoices-plan.md). Authenticate, check the shape, read the total
 * strictly, call the invoices service; the rules (who may move it, the stage it must be in) live in
 * src/lib/invoices/core.ts and come back as a FieldError, which withResult turns into the result the field, the
 * sheet or the toast shows. A move that lost to the other partner's carries its line on `fieldErrors.stage`.
 */

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().max(20_000).nullable();

const patchSchema = z
  .object({
    contactId: id.nullable(),
    invoiceNumber: z.string().max(200).nullable(),
    invoiceDate: day,
    total: z.string().max(40).nullable(),
    note: text,
  })
  .partial()
  .strict();

/** A saved field: the one the person just left. `changed` names what the save changed, empty for a save of the same value. */
export async function saveInvoiceFieldsAction(invoiceId: string, patch: z.input<typeof patchSchema>): Promise<ActionResult<{ changed: string[] }>> {
  return withResult("saveInvoiceFields", async () => {
    const user = await requireUser();
    const p = patchSchema.parse(patch);
    const { total, invoiceDate, ...rest } = p;
    let totalCents: number | null | undefined;
    if (total !== undefined) {
      const read = readTotal(total);
      if (!read.ok) throw new FieldError({ total: read.message });
      totalCents = read.cents;
    }
    return invoices.editInvoice(
      id.parse(invoiceId),
      { ...rest, ...(invoiceDate !== undefined ? { invoiceDate: invoiceDate as Ymd } : {}), ...(totalCents !== undefined ? { totalCents } : {}) },
      invoices.staffActor(user),
    );
  });
}

export async function approveInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return withResult("approveInvoice", async () => {
    const user = await requireUser();
    await invoices.approveInvoice(id.parse(invoiceId), invoices.staffActor(user));
  });
}

export async function backToReviewAction(invoiceId: string): Promise<ActionResult> {
  return withResult("backToReview", async () => {
    const user = await requireUser();
    await invoices.backToReview(id.parse(invoiceId), invoices.staffActor(user));
  });
}

const paidSchema = z.object({ paidOn: day, method: z.string().min(1).max(20), note: z.string().max(500).nullable() }).strict();

/**
 * Mark paid. The answer's `paidAt` is this payment's mark, which Undo paid takes, and `detail` is the toast's clause
 * about who hears ("Zack gets an email").
 */
export async function markPaidAction(invoiceId: string, input: z.input<typeof paidSchema>): Promise<ActionResult<{ paidAt: string; detail: string | null }>> {
  return withResult("markPaid", async () => {
    const user = await requireUser();
    const p = paidSchema.parse(input);
    const r = await invoices.markPaid(
      id.parse(invoiceId),
      { paidOn: p.paidOn as Ymd, method: p.method as never, note: p.note },
      invoices.staffActor(user),
    );
    return { paidAt: r.paidAt, detail: paidToastDetail(r.contactName, r.email) };
  });
}

export async function undoPaidAction(invoiceId: string, paidAt: string): Promise<ActionResult> {
  return withResult("undoPaid", async () => {
    const user = await requireUser();
    await invoices.undoPaid(id.parse(invoiceId), z.string().max(40).parse(paidAt), invoices.staffActor(user));
  });
}

const stage = z.enum(["REVIEW", "TO_PAY"]);

/** Not an invoice, from the stage the page showed. */
export async function markNotInvoiceAction(invoiceId: string, expected: "REVIEW" | "TO_PAY"): Promise<ActionResult<{ from: "REVIEW" | "TO_PAY" }>> {
  return withResult("markNotInvoice", async () => {
    const user = await requireUser();
    return invoices.markNotInvoice(id.parse(invoiceId), stage.parse(expected), invoices.staffActor(user));
  });
}

/** Undo for Not an invoice, and Restore on the page: back to the stage it was cleared from. */
export async function restoreInvoiceAction(invoiceId: string): Promise<ActionResult<{ stage: "REVIEW" | "TO_PAY" }>> {
  return withResult("restoreInvoice", async () => {
    const user = await requireUser();
    return invoices.restoreInvoice(id.parse(invoiceId), invoices.staffActor(user));
  });
}

export async function linkJobAction(invoiceId: string, taskId: string): Promise<ActionResult> {
  return withResult("linkInvoiceJob", async () => {
    const user = await requireUser();
    await invoices.linkJob(id.parse(invoiceId), id.parse(taskId), invoices.staffActor(user));
  });
}

const jobRef = z.union([z.object({ linkId: id }).strict(), z.object({ taskId: id }).strict()]);

/** Takes a job off, by its link (which still names a job that has since been deleted) or by the job itself. */
export async function unlinkJobAction(invoiceId: string, ref: z.input<typeof jobRef>): Promise<ActionResult> {
  return withResult("unlinkInvoiceJob", async () => {
    const user = await requireUser();
    await invoices.unlinkJob(id.parse(invoiceId), jobRef.parse(ref), invoices.staffActor(user));
  });
}

// Where the browser put the file and what to call it, never its URL, size or type: the record step reads those from
// Blob. The queue sends display hints along, which an invoice keeps none of.
const recordedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(400),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
  })
  .strict();

/** After the browser finished uploading an invoice file straight to Blob: checked, hashed and kept on the invoice. */
export async function recordInvoiceFileAction(
  invoiceId: string,
  file: z.input<typeof recordedSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("recordInvoiceFile", async () => {
    const user = await requireUser();
    assertQueueOwner(z.string().max(80).nullish().parse(queueOwner), appScope(user.id));
    const { pathname, filename } = recordedSchema.parse(file);
    return invoices.recordInvoiceUpload(id.parse(invoiceId), { pathname, filename }, invoices.staffActor(user));
  });
}
