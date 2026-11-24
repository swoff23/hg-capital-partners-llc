import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { INVOICE_FILE_RULES, blobSizeRefusal, invoiceFileKind, invoiceFolder, invoiceSendParent, storedInvoiceUploadPath, type InvoiceUploadKind } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, safeUploadName } from "@/lib/attachments/paths";
import { todayYmdEastern, type Ymd } from "@/lib/dates";
import {
  ALREADY_ADDED,
  FILE_NEEDED,
  NOT_IN_FOLDER,
  addInvoiceFile,
  createPortalInvoice,
  createStaffInvoice,
  sendRefusal,
  type Actor,
  type Contractor,
  type InvoiceFileMeta,
  type Staff,
} from "./core";

/**
 * An invoice's files (docs/contractor-invoices-plan.md, 4.4 and 5.2), on a passed client and a passed set of Blob
 * calls, so a test can stand in for the store. service.ts binds the app's client and the private store's token.
 *
 * Every invoice file is the invoice's own private copy with the SHA-256 of its bytes (M10's "the exact same file"):
 *  - a partner's upload (invoice-upload) lands in invoices/<invoiceId>/ and recordInvoiceUpload checks it and adds it;
 *  - a contractor's Send invoice (portal-invoice-upload) uploads to invoice-sends/<taskId>/<contactId>/ first, their
 *    own folder on that job, and sendPortalInvoice checks each file and makes the invoice with them;
 *  - Use as invoice copies a job's file server-side into invoices/<newId>/, so removing the job's file or deleting the
 *    job never touches the invoice.
 *
 * Each upload is checked the way a lease's file is (tenants/files.ts): where it sits, that it's in the private
 * store, a PDF or a photo, and within its cap, by head()'s own count. A refused blob is deleted.
 */

type Db = PrismaClient;

/** The Blob calls this needs, on the private store. */
export interface InvoiceBlobOps {
  /** The private store's id (paths.ts storeIdFromToken), to tell our private blobs from anything else. */
  storeId: string;
  /** The stored blob, or null when there's none at that path. */
  head(pathname: string): Promise<{ url: string; pathname: string; size: number; contentType: string } | null>;
  /** The SHA-256 of the blob's bytes, lowercase hex. */
  sha256(urlOrPathname: string): Promise<string>;
  /** A server-side copy to `toPathname` in the same store, private, with a random suffix. */
  copy(fromUrl: string, toPathname: string, contentType: string | null): Promise<{ url: string; pathname: string; contentType: string | null }>;
  /** Deletes a blob; never throws. */
  del(urlOrPathname: string): Promise<void>;
}

export const UPLOAD_UNFINISHED = "That upload didn't finish. Try again.";
export const NOT_PRIVATE = "That file isn't in our private storage.";
export const PDF_OR_PHOTO = "Add a PDF or a photo of the invoice.";
export { ALREADY_ADDED, NOT_IN_FOLDER };
export const FILE_GONE = "That file is gone. Reload the page.";
export const NOT_A_DOCUMENT = "Only a photo or a document can be an invoice.";
export const STILL_PUBLIC = "This file is still in public storage. Move documents to private storage in Settings first.";

/** What the browser says it uploaded: the path it asked for and the name the person picked. */
export interface UploadedBlob {
  pathname: string;
  filename: string;
}

/**
 * One uploaded blob, checked and hashed, as the meta core.ts records. `parentId` is the kind's parent: the invoice's
 * id, or the job and contractor (limits.ts invoiceSendParent) for a Send invoice. A refusal is a FieldError on
 * `files`, and the refused blob is deleted, since nothing will ever point at it.
 */
export async function checkUploadedBlob(db: Db, ops: InvoiceBlobOps, kind: InvoiceUploadKind, parentId: string, input: UploadedBlob): Promise<InvoiceFileMeta> {
  if (!storedInvoiceUploadPath(kind, input.pathname, parentId)) throw new FieldError({ files: NOT_IN_FOLDER });
  if (await db.invoiceFile.findUnique({ where: { pathname: input.pathname }, select: { id: true } })) throw new FieldError({ files: ALREADY_ADDED });
  const blob = await ops.head(input.pathname);
  if (!blob) throw new FieldError({ files: UPLOAD_UNFINISHED });
  const refuse = async (message: string): Promise<never> => {
    await ops.del(blob.pathname === input.pathname ? blob.url : input.pathname);
    throw new FieldError({ files: message });
  };
  if (blob.pathname !== input.pathname || !isPrivateStoreUrl(blob.url, ops.storeId, input.pathname)) return refuse(NOT_PRIVATE);
  const contentType = normalizeContentType(blob.contentType);
  const fileKind = invoiceFileKind(contentType);
  if (!fileKind) return refuse(PDF_OR_PHOTO);
  const tooBig = blobSizeRefusal(blob.size, INVOICE_FILE_RULES[fileKind].maxBytes);
  if (tooBig) return refuse(tooBig);
  return {
    url: blob.url,
    pathname: input.pathname,
    filename: filenameForType(input.filename, contentType).slice(0, 255) || "Invoice",
    size: Math.max(0, Math.trunc(blob.size)),
    contentType,
    sha256: await ops.sha256(blob.url),
  };
}

/**
 * Add the invoice file on a To review invoice (a partner's invoice-upload): checked, hashed and recorded with a
 * "file added" line. core.ts addInvoiceFile checks for duplicates again (M10) and refuses once it's approved.
 */
export async function recordInvoiceUpload(db: Db, ops: InvoiceBlobOps, invoiceId: string, input: UploadedBlob, by: Actor): Promise<{ id: string }> {
  // A retried record (its first answer was lost after it committed) finds the file it made, rather than reading as
  // "already on an invoice" and leading someone to add it twice.
  const had = await db.invoiceFile.findUnique({ where: { pathname: input.pathname }, select: { id: true, invoiceId: true } });
  if (had?.invoiceId === invoiceId) return { id: had.id };
  const meta = await checkUploadedBlob(db, ops, "invoice-upload", invoiceId, input);
  return addInvoiceFile(db, invoiceId, meta, by);
}

export interface PortalSendInput {
  taskId: string;
  invoiceNumber?: string | null;
  totalCents?: number | null;
  /** What portal-invoice-upload put in this contractor's folder on the job. */
  files: readonly UploadedBlob[];
}

/**
 * Send invoice (4.1): the contractor's uploads, each checked and hashed, become the files of a new To review
 * invoice linked to the job (core.ts createPortalInvoice holds who may send and from which job).
 */
export async function sendPortalInvoice(db: Db, ops: InvoiceBlobOps, input: PortalSendInput, by: Contractor, today: Ymd): Promise<{ id: string }> {
  // Who may send, from which job, before any blob is read: a link session signs in first (M16).
  const refusal = await sendRefusal(db, input.taskId, by);
  if (refusal) throw new FieldError({ invoice: refusal });
  // One blob listed twice is one file.
  const uploads = [...new Map(input.files.map((f) => [f.pathname, f])).values()];
  if (uploads.length === 0) throw new FieldError({ files: FILE_NEEDED });
  // A Send tapped again after the first one committed (its answer lost on a weak connection) gets the invoice it
  // made, so the sent screen shows, rather than a refusal that leads to sending the bill twice.
  const sent = await sentBefore(db, input.taskId, by, uploads);
  if (sent) return { id: sent };
  const folder = invoiceSendParent(input.taskId, by.contactId);
  const metas: InvoiceFileMeta[] = [];
  for (const f of uploads) metas.push(await checkUploadedBlob(db, ops, "portal-invoice-upload", folder, f));
  return createPortalInvoice(db, { taskId: input.taskId, invoiceNumber: input.invoiceNumber, totalCents: input.totalCents, files: metas }, by, today);
}

/** The portal invoice from this contractor on this job that already holds exactly these uploads, if one does. */
async function sentBefore(db: Db, taskId: string, by: Contractor, uploads: readonly UploadedBlob[]): Promise<string | null> {
  const rows = await db.invoiceFile.findMany({ where: { pathname: { in: uploads.map((f) => f.pathname) } }, select: { invoiceId: true } });
  const ids = new Set(rows.map((r) => r.invoiceId));
  if (rows.length !== uploads.length || ids.size !== 1) return null;
  const [id] = ids;
  const inv = await db.invoice.findFirst({
    where: { id, source: "PORTAL", createdByContactId: by.contactId, tasks: { some: { taskId } } },
    select: { id: true, _count: { select: { files: true } } },
  });
  return inv && inv._count.files === uploads.length ? inv.id : null;
}

/**
 * Use as invoice (4.4) on a job's file: a To review invoice (source STAFF, M6) with that job linked and its
 * contractor filled in when the job is assigned to one who isn't archived. Photos and documents only, never a video
 * or a link. The file is copied in the store into the new invoice's own folder before the row is made, so the
 * invoice keeps it whatever happens to the job's. A canceled job's file still makes an invoice, with no job on it,
 * since a canceled job takes no invoice (M7).
 */
export async function useAsInvoice(db: Db, ops: InvoiceBlobOps, attachmentId: string, by: Staff, today: Ymd): Promise<{ id: string }> {
  const a = await db.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      kind: true,
      url: true,
      pathname: true,
      filename: true,
      size: true,
      contentType: true,
      width: true,
      height: true,
      createdAt: true,
      deletedAt: true,
      task: { select: { id: true, status: true, bucket: true, assigneeContact: { select: { id: true, archivedAt: true } } } },
    },
  });
  if (!a || a.deletedAt || !a.url || !a.pathname || a.task.bucket === TEMPLATE_BUCKET || a.task.status === "DRAFT") throw new FieldError({ file: FILE_GONE });
  if (a.kind !== "IMAGE" && a.kind !== "FILE") throw new FieldError({ file: NOT_A_DOCUMENT });
  if (!isPrivateStoreUrl(a.url, ops.storeId, a.pathname)) throw new FieldError({ file: STILL_PUBLIC });

  const id = randomUUID();
  const to = `${invoiceFolder(id)}${safeUploadName(a.filename)}`;
  const sha256 = await ops.sha256(a.url);
  const copied = await ops.copy(a.url, to, a.contentType);
  const contact = a.task.assigneeContact && !a.task.assigneeContact.archivedAt ? a.task.assigneeContact.id : null;
  try {
    return await createStaffInvoice(
      db,
      {
        id,
        contactId: contact,
        // Dated the day the file reached the job (M3: the day it arrived), not the day a partner picked it.
        invoiceDate: todayYmdEastern(a.createdAt),
        taskIds: a.task.status === "CANCELED" ? [] : [a.task.id],
        files: [
          {
            url: copied.url,
            pathname: copied.pathname,
            filename: a.filename,
            size: a.size ?? 0,
            contentType: a.contentType ?? copied.contentType,
            sha256,
            width: a.width,
            height: a.height,
          },
        ],
      },
      by,
      today,
    );
  } catch (err) {
    // The row never came to be, so nothing points at the copy.
    await ops.del(copied.url);
    throw err;
  }
}
