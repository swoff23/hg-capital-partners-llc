import "server-only";
import { createHash } from "node:crypto";
import { BlobNotFoundError, copy, del, get, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { FieldError } from "@/lib/action-result";
import { noStoreMessage } from "@/lib/attachments/blob-stores";
import { storeIdFromToken } from "@/lib/attachments/paths";
import { todayYmdEastern } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import * as core from "./core";
import * as files from "./files";

/**
 * Contractor invoices (docs/contractor-invoices-plan.md): the app's one way
 * to write them. Server actions and the inbound email path authenticate and
 * parse, then call in; the rules live in core.ts, each write in one
 * transaction with its history line. Every write refreshes the pages that
 * show an invoice: Invoices and the invoice's page, the task pages' Invoices
 * section, Home's Needs you, and the portal's job page and Your invoices.
 *
 * Usable from the portal: nothing here imports staff auth, QuickBooks,
 * tasks/service or tasks/attachments (auth-guard.test.ts).
 */

function revalidateInvoices(invoiceId?: string): void {
  revalidatePath("/invoices", "layout");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/tasks/[id]", "page");
  revalidatePath("/");
  revalidatePath("/p/invoices");
  revalidatePath("/p/jobs/[id]", "page");
}

export type {
  PaidResult,
  Actor,
  Contractor,
  EmailInvoiceInput,
  InvoiceFileMeta,
  InvoicePatch,
  InvoiceSave,
  JobRef,
  PaidInput,
  ReplyInvoiceInput,
  Staff,
} from "./core";
export { STAGE_FIELD, staffActor, systemActor } from "./core";

/**
 * A partner's New invoice: its fields only. Its files come through recordInvoiceUpload, and Use as invoice is
 * useAsInvoice. Nothing here takes a caller's file meta (url, pathname, hash): the only ways a file is recorded are
 * the checked ones in files.ts, and the inbound path's own, so no action can attach a blob it names.
 */
export async function createStaffInvoice(input: NewInvoiceInput, by: core.Staff): Promise<{ id: string }> {
  const r = await core.createStaffInvoice(prisma, { ...input, id: undefined, files: [] }, by, todayYmdEastern());
  revalidateInvoices(r.id);
  return r;
}

export type NewInvoiceInput = Omit<core.StaffInvoiceInput, "id" | "files">;

/** The inbound path's own write, with the file metas it made from the email's attachments (never a browser's). */
export async function createEmailInvoice(input: core.EmailInvoiceInput, by: core.Actor): Promise<{ id: string; created: boolean }> {
  const r = await core.createEmailInvoice(prisma, input, by);
  if (r.created) revalidateInvoices(r.id);
  return r;
}

/** The inbound reply path's own write, with the file metas it made from the reply's attachments. */
export async function createReplyInvoice(input: core.ReplyInvoiceInput, by: core.Contractor): Promise<{ id: string; created: boolean }> {
  const r = await core.createReplyInvoice(prisma, input, by);
  if (r.created) revalidateInvoices(r.id);
  return r;
}

/**
 * A To review write (a field, a job, a file) that another partner's move got to first is refused with the stage it
 * went to. It refreshes the pages too, as a refused stage move does, so the screen stops offering To review edits.
 */
async function inReview<T>(invoiceId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof FieldError && core.STAGE_FIELD in err.fieldErrors) revalidateInvoices(invoiceId);
    throw err;
  }
}

export async function editInvoice(invoiceId: string, patch: core.InvoicePatch, by: core.Staff): Promise<{ changed: string[] }> {
  const r = await inReview(invoiceId, () => core.editInvoice(prisma, invoiceId, patch, by));
  if (r.changed.length > 0) revalidateInvoices(invoiceId);
  return r;
}

/** The invoice page's Save: fields and jobs in one transaction (core.saveInvoice). */
export async function saveInvoice(invoiceId: string, input: core.InvoiceSave, by: core.Staff): Promise<{ changed: string[] }> {
  const r = await inReview(invoiceId, () => core.saveInvoice(prisma, invoiceId, input, by));
  if (r.changed.length > 0) revalidateInvoices(invoiceId);
  return r;
}

export async function linkJob(invoiceId: string, taskId: string, by: core.Staff): Promise<void> {
  await inReview(invoiceId, () => core.linkJob(prisma, invoiceId, taskId, by));
  revalidateInvoices(invoiceId);
}

export async function unlinkJob(invoiceId: string, ref: core.JobRef, by: core.Staff): Promise<void> {
  await inReview(invoiceId, () => core.unlinkJob(prisma, invoiceId, ref, by));
  revalidateInvoices(invoiceId);
}

/**
 * A stage move. A refused one (another partner moved it first) still refreshes the pages, so the screen that sent
 * it shows where the invoice is now, as the toast says.
 */
async function move<T>(invoiceId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    revalidateInvoices(invoiceId);
  }
}

export async function approveInvoice(invoiceId: string, by: core.Staff): Promise<void> {
  await move(invoiceId, () => core.approveInvoice(prisma, invoiceId, by));
}

export async function backToReview(invoiceId: string, by: core.Staff): Promise<void> {
  await move(invoiceId, () => core.backToReview(prisma, invoiceId, by));
}

/** Mark paid. The answer's `email` and `contactName` word the toast (email-content.ts paidToastDetail). */
export async function markPaid(invoiceId: string, input: core.PaidInput, by: core.Staff): Promise<core.PaidResult> {
  return move(invoiceId, () => core.markPaid(prisma, invoiceId, input, by));
}

export async function undoPaid(invoiceId: string, paidAt: string, by: core.Staff): Promise<void> {
  await move(invoiceId, () => core.undoPaid(prisma, invoiceId, paidAt, by));
}

export async function markNotInvoice(invoiceId: string, expected: "REVIEW" | "TO_PAY", by: core.Staff): Promise<{ from: "REVIEW" | "TO_PAY" }> {
  return move(invoiceId, () => core.markNotInvoice(prisma, invoiceId, expected, by));
}

export async function restoreInvoice(invoiceId: string, by: core.Staff): Promise<{ stage: "REVIEW" | "TO_PAY" }> {
  return move(invoiceId, () => core.restoreInvoice(prisma, invoiceId, by));
}

/** The contractor an emailed invoice is from (M11), or null for "Who's this from?". Reads only. */
export async function matchContractor(fromLine: string, dmarc: string | null | undefined): Promise<string | null> {
  return core.matchContractor(prisma, fromLine, dmarc);
}

// ---------------------------------------------------------------------------
// Files (files.ts), on the private Blob store
// ---------------------------------------------------------------------------

/** The private store's calls for files.ts. A refusal when no store is connected names it, as every record step does. */
function blobOps(): files.InvoiceBlobOps {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new FieldError({ files: noStoreMessage("private") });
  return {
    storeId,
    async head(pathname) {
      try {
        const b = await head(pathname, { token });
        return { url: b.url, pathname: b.pathname, size: b.size, contentType: b.contentType };
      } catch (err) {
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
    },
    async sha256(urlOrPathname) {
      const blob = await get(urlOrPathname, { access: "private", token });
      if (!blob || blob.statusCode !== 200 || !blob.stream) throw new FieldError({ files: files.UPLOAD_UNFINISHED });
      const hash = createHash("sha256");
      const reader = blob.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
      return hash.digest("hex");
    },
    async copy(fromUrl, toPathname, contentType) {
      const c = await copy(fromUrl, toPathname, { access: "private", token, addRandomSuffix: true, ...(contentType ? { contentType } : {}) });
      return { url: c.url, pathname: c.pathname, contentType: c.contentType || null };
    },
    async del(urlOrPathname) {
      try {
        await del(urlOrPathname, { token });
      } catch (err) {
        logError("invoices:files:discard", err, { pathname: urlOrPathname });
      }
    },
  };
}

export type { InvoiceBlobOps, PortalSendInput, UploadedBlob } from "./files";

/** Add the invoice file: a partner's invoice-upload blob onto a To review invoice, checked, hashed and recorded. */
export async function recordInvoiceUpload(invoiceId: string, input: files.UploadedBlob, by: core.Staff): Promise<{ id: string }> {
  const r = await inReview(invoiceId, () => files.recordInvoiceUpload(prisma, blobOps(), invoiceId, input, by));
  revalidateInvoices(invoiceId);
  return r;
}

/** Send invoice from a portal job: the contractor's uploads become a new To review invoice's files. */
export async function sendPortalInvoice(input: files.PortalSendInput, by: core.Contractor): Promise<{ id: string }> {
  const r = await files.sendPortalInvoice(prisma, blobOps(), input, by, todayYmdEastern());
  revalidateInvoices(r.id);
  return r;
}

/** Use as invoice on a job's photo or document: a To review invoice with its own copy of the file and that job. */
export async function useAsInvoice(attachmentId: string, by: core.Staff): Promise<{ id: string }> {
  const r = await files.useAsInvoice(prisma, blobOps(), attachmentId, by, todayYmdEastern());
  revalidateInvoices(r.id);
  return r;
}

/** Why a contractor can't send an invoice from this job, or null (the portal-invoice-upload token route asks). */
export async function sendRefusal(taskId: string, by: Pick<core.Contractor, "contactId" | "onlyTaskId">): Promise<string | null> {
  return core.sendRefusal(prisma, taskId, by);
}
