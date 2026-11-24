import { FILE_KINDS, PREVIEW_RULE, UPLOAD_RULES, contentTypeForName, nameExtension, type FileKind, type UploadRule } from "./content-types";
import { requestedUploadRole } from "./paths";

/**
 * What one task upload may be: the token limits the token route mints before
 * any bytes move, and the display hints the record step keeps once it lands.
 * Pure; see limits.test.ts.
 */

/** What the token route hands Blob for one upload. */
export interface TokenLimits {
  maximumSizeInBytes: number;
  allowedContentTypes: string[];
}

const isFileKind = (k: unknown): k is FileKind => typeof k === "string" && (FILE_KINDS as readonly string[]).includes(k);

/**
 * The token limits for a task upload, or why it's refused. The path must be
 * this task's (paths.ts) and `fileKind` picks the allowlist and cap.
 * Thumbnails and posters are always stills (PREVIEW_RULE). A name with an
 * extension must name a type its kind allows, so "payload.html" can't land as
 * a text file and a video can't sit at "clip.jpg". `allowed` is the upload
 * kind's own list of file kinds, when it has one.
 */
export function uploadLimits(taskId: string, pathname: string, fileKind: unknown, allowed?: readonly FileKind[]): TokenLimits | string {
  const role = requestedUploadRole(pathname, taskId);
  if (!role) return "That upload path isn't allowed.";
  if (!isFileKind(fileKind)) return "fileKind must be image, video or file.";
  // The kind's own table (upload-kinds.ts UPLOAD_KIND_ALLOWED): a contractor's photos and videos can't be a document.
  if (allowed && !allowed.includes(fileKind)) return "Only photos and videos can be added here.";
  let rule: UploadRule = UPLOAD_RULES[fileKind];
  if (role !== "orig") {
    if (fileKind !== "image") return "Thumbnails and posters must be images.";
    rule = PREVIEW_RULE;
  }
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (nameExtension(name) !== null) {
    const type = contentTypeForName(name);
    if (!type || !rule.contentTypes.includes(type)) return "That file name doesn't match its type.";
  }
  return { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: [...rule.contentTypes] };
}

/** The image types a public photo may be: what the public site and PhotoThumb can draw. No HEIC (the uploader converts it first). */
export const PUBLIC_PHOTO_RULE: UploadRule = {
  contentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  maxBytes: UPLOAD_RULES.image.maxBytes,
};

/** The property kinds' token routes. */
export type PropertyUploadKind = "property-upload" | "listing-photo-upload" | "property-photo-upload" | "lockbox-photo-upload";

const PROPERTY_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A stored-name slug: the upload path's last part (uploads 2.1). */
const SLUG = /^[A-Za-z0-9._-]{1,100}$/;
/**
 * The token limits for a property upload, or why it's refused (the same
 * table the uploader checks first and the record step checks again with
 * head()). The path must be this property's for its kind:
 *
 *   property-upload        properties/<id>/<slug>        a document (fileKind "file") or a photo ("image"),
 *                                                        each under its own cap in UPLOAD_RULES
 *   listing-photo-upload   <slug>                        a public photo, 25 MB (the listing photo manager's bare slug)
 *   property-photo-upload  properties/<id>/photo/<slug>  a public photo, 25 MB
 *
 * A document's name with an extension must name a type its kind allows, as
 * for tasks.
 */
export function propertyUploadLimits(kind: PropertyUploadKind, propertyId: string, pathname: string, fileKind?: unknown): TokenLimits | string {
  if (!PROPERTY_ID.test(propertyId)) return "That upload path isn't allowed.";
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (kind === "property-upload") {
    if (pathname !== `properties/${propertyId}/${name}` || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) return "That upload path isn't allowed.";
    if (fileKind !== "file" && fileKind !== "image") return "fileKind must be image or file.";
    const rule = UPLOAD_RULES[fileKind];
    if (nameExtension(name) !== null) {
      const type = contentTypeForName(name);
      if (!type || !rule.contentTypes.includes(type)) return "That file name doesn't match its type.";
    }
    return { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: [...rule.contentTypes] };
  }
  if (kind === "listing-photo-upload") {
    // The listing photos go through the upload queue, which names each blob by its stored name's slug (upload-kinds.ts uploadRequest).
    if (pathname !== name || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) return "That upload path isn't allowed.";
  } else if (kind === "lockbox-photo-upload") {
    // A unit's lockbox photo, private, and the thumbnail made beside it (docs/specs/lockbox-location.md).
    const folder = `properties/${propertyId}/lockbox/`;
    if ((pathname !== `${folder}${name}` && pathname !== `${folder}thumb/${name}`) || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) {
      return "That upload path isn't allowed.";
    }
  } else if (pathname !== `properties/${propertyId}/photo/${name}` || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) {
    return "That upload path isn't allowed.";
  }
  return { maximumSizeInBytes: PUBLIC_PHOTO_RULE.maxBytes, allowedContentTypes: [...PUBLIC_PHOTO_RULE.contentTypes] };
}

/** Whether a stored property-document blob sits where `propertyUploadLimits` put it (Blob adds a random suffix). */
export function storedPropertyDocumentPath(pathname: string, propertyId: string): boolean {
  if (!PROPERTY_ID.test(propertyId)) return false;
  const prefix = `properties/${propertyId}/`;
  // No further slash, so the property photo's folder is never a document.
  return pathname.startsWith(prefix) && /^[A-Za-z0-9._-]{1,160}$/.test(pathname.slice(prefix.length)) && /[A-Za-z0-9]/.test(pathname.slice(prefix.length));
}

/**
 * A contractor's W-9 or insurance (docs/specs/contractor-onboarding.md): contacts/<contactId>/<w9|insurance>/<name>,
 * a photo or a document, each to its own cap, as a property document.
 */
export function contactUploadLimits(contactId: string, docKind: unknown, pathname: string, fileKind?: unknown): TokenLimits | string {
  if (!PROPERTY_ID.test(contactId) || (docKind !== "w9" && docKind !== "insurance")) return "That upload path isn't allowed.";
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname !== `contacts/${contactId}/${docKind}/${name}` || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) return "That upload path isn't allowed.";
  if (fileKind !== "file" && fileKind !== "image") return "fileKind must be image or file.";
  const rule = UPLOAD_RULES[fileKind];
  if (nameExtension(name) !== null) {
    const type = contentTypeForName(name);
    if (!type || !rule.contentTypes.includes(type)) return "That file name doesn't match its type.";
  }
  return { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: [...rule.contentTypes] };
}

/** Whether a stored contact-document blob sits where `contactUploadLimits` put it (Blob adds a random suffix). */
export function storedContactDocumentPath(pathname: string, contactId: string, docKind: "w9" | "insurance"): boolean {
  if (!PROPERTY_ID.test(contactId)) return false;
  const prefix = `contacts/${contactId}/${docKind}/`;
  const rest = pathname.slice(prefix.length);
  return pathname.startsWith(prefix) && /^[A-Za-z0-9._-]{1,160}$/.test(rest) && /[A-Za-z0-9]/.test(rest);
}

/**
 * A signed lease's token (docs/specs/tenants.md): its own lease's folder, leases/<leaseId>/<safe name>, a photo or
 * a PDF, held to that file kind's type list and cap, as a contractor's W-9 is.
 */
export function leaseUploadLimits(leaseId: string, pathname: string, fileKind?: unknown): TokenLimits | string {
  if (!PROPERTY_ID.test(leaseId)) return "That upload path isn't allowed.";
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname !== `leases/${leaseId}/${name}` || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) return "That upload path isn't allowed.";
  if (fileKind !== "file" && fileKind !== "image") return "fileKind must be image or file.";
  const rule = UPLOAD_RULES[fileKind];
  if (nameExtension(name) !== null) {
    const type = contentTypeForName(name);
    if (!type || !rule.contentTypes.includes(type)) return "That file name doesn't match its type.";
  }
  return { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: [...rule.contentTypes] };
}

/** Whether a stored lease blob sits where `leaseUploadLimits` put it (Blob adds a random suffix). */
export function storedLeaseDocumentPath(pathname: string, leaseId: string): boolean {
  if (!PROPERTY_ID.test(leaseId)) return false;
  const prefix = `leases/${leaseId}/`;
  const rest = pathname.slice(prefix.length);
  return pathname.startsWith(prefix) && /^[A-Za-z0-9._-]{1,160}$/.test(rest) && /[A-Za-z0-9]/.test(rest);
}

/** The record step's refusal of a blob that arrived with no bytes: the upload broke, so it goes again. */
export const EMPTY_UPLOAD = "That file arrived empty. Try again.";

/**
 * Why the record step refuses a blob of `size` bytes (head()'s own count) under a rule's cap, or null. An empty
 * one is a broken upload; the page refuses an empty file before it goes (media.ts checkMediaFile).
 */
export function blobSizeRefusal(size: number, maxBytes: number): string | null {
  if (!(size > 0)) return EMPTY_UPLOAD;
  if (size > maxBytes) return `That file is over the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
  return null;
}

/** A display hint (seconds, pixels) kept only when it's a sane positive number. */
export function mediaHint(n: number | null | undefined, max: number): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

/** Width or height in whole pixels, up to 20000. */
export function pixelHint(n: number | null | undefined): number | null {
  const v = mediaHint(n, 20000);
  return v === null ? null : Math.round(v);
}

/** A video's length in seconds, up to a day. */
export function durationHint(n: number | null | undefined): number | null {
  return mediaHint(n, 24 * 3600);
}

/**
 * An invoice's file (docs/contractor-invoices-plan.md, 5.2): a PDF or a photo, never a video or another document.
 * The same caps as any photo or document (UPLOAD_RULES); only the document types narrow to PDF.
 */
export const INVOICE_FILE_RULES: Record<"image" | "file", UploadRule> = {
  image: UPLOAD_RULES.image,
  file: { contentTypes: ["application/pdf"], maxBytes: UPLOAD_RULES.file.maxBytes },
};

/** The invoice upload kinds' token routes. */
export type InvoiceUploadKind = "invoice-upload" | "portal-invoice-upload";

/**
 * The parent of a contractor's Send invoice uploads: the job and the contractor, "<taskId>:<contactId>". The folder
 * names the uploader as well as the job, so one contractor on a job can't record another's staged file (M14: an
 * invoice file is private to its contractor). The token route builds it from the signed-in contractor, never from
 * the browser's payload.
 */
export function invoiceSendParent(taskId: string, contactId: string): string {
  return `${taskId}:${contactId}`;
}

export function readInvoiceSendParent(parentId: string): { taskId: string; contactId: string } | null {
  const m = /^([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{1,64})$/.exec(parentId);
  return m ? { taskId: m[1], contactId: m[2] } : null;
}

/** An invoice's own folder, invoices/<invoiceId>/: a partner's upload, Use as invoice's copy, an email's files. */
export function invoiceFolder(invoiceId: string): string {
  return `invoices/${invoiceId}/`;
}

/**
 * Where each invoice kind's files go, or null for a parent that isn't one. A partner's upload is the invoice's own
 * folder (invoiceFolder). A contractor's Send invoice uploads before the invoice exists, so its files wait in
 * invoice-sends/<taskId>/<contactId>/ (invoiceSendParent) until the send records them on the new invoice. Use as
 * invoice copies a job's file into invoices/<invoiceId>/ too (invoices/files.ts), so every invoice file is its own copy.
 */
export function invoiceUploadFolder(kind: InvoiceUploadKind, parentId: string): string | null {
  if (kind === "invoice-upload") return PROPERTY_ID.test(parentId) ? invoiceFolder(parentId) : null;
  const p = readInvoiceSendParent(parentId);
  return p ? `invoice-sends/${p.taskId}/${p.contactId}/` : null;
}

/**
 * The token limits for an invoice upload, or why it's refused: the path is the kind's folder for this parent
 * (invoiceUploadFolder) with a safe name, and `fileKind` is "image" or "file", held to INVOICE_FILE_RULES. A name
 * with an extension must name a type that rule allows, so "bill.docx" is refused before any bytes move.
 */
export function invoiceUploadLimits(kind: InvoiceUploadKind, parentId: string, pathname: string, fileKind?: unknown): TokenLimits | string {
  const folder = invoiceUploadFolder(kind, parentId);
  if (!folder) return "That upload path isn't allowed.";
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (pathname !== `${folder}${name}` || !SLUG.test(name) || !/[A-Za-z0-9]/.test(name)) return "That upload path isn't allowed.";
  if (fileKind !== "file" && fileKind !== "image") return "Add a PDF or a photo of the invoice.";
  const rule = INVOICE_FILE_RULES[fileKind];
  if (nameExtension(name) !== null) {
    const type = contentTypeForName(name);
    if (!type || !rule.contentTypes.includes(type)) return "Add a PDF or a photo of the invoice.";
  }
  return { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: [...rule.contentTypes] };
}

/** Whether a stored invoice blob sits where `invoiceUploadLimits` put it (Blob adds a random suffix). */
export function storedInvoiceUploadPath(kind: InvoiceUploadKind, pathname: string, parentId: string): boolean {
  const prefix = invoiceUploadFolder(kind, parentId);
  if (!prefix) return false;
  const rest = pathname.slice(prefix.length);
  return pathname.startsWith(prefix) && /^[A-Za-z0-9._-]{1,160}$/.test(rest) && /[A-Za-z0-9]/.test(rest);
}

/** Which invoice rule a stored blob's type falls under, or null for anything else (a video, a Word file). */
export function invoiceFileKind(contentType: string | null | undefined): "image" | "file" | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (INVOICE_FILE_RULES.image.contentTypes.includes(t)) return "image";
  if (INVOICE_FILE_RULES.file.contentTypes.includes(t)) return "file";
  return null;
}
