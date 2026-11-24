import { invoiceUploadFolder, readInvoiceSendParent } from "./limits";
import { uploadSlug } from "./media";
import { newTaskUploadPath, residentUploadPath, taskUploadPath, type UploadRole } from "./paths";
import type { FileKind } from "./content-types";

/**
 * The upload kinds: each one is a /api/blob/[kind] token route, so the key a
 * surface passes (`UploadTarget.uploadKind`, `useMediaUploader`) is the
 * route's own key. Fixed here for every target the uploads spec names
 * (docs/specs/uploads-photos.md 2.1, build plan 1.5); the route types its
 * table against this list. Pure; see upload-kinds.test.ts.
 *
 *   task-upload            staff, a task's files            { taskId, fileKind }
 *   portal-task-upload     a contractor, on a job           { taskId, fileKind, queuedAt? }
 *   property-upload        staff, a property's documents    { propertyId, fileKind }
 *   listing-photo-upload   staff, a listing's public photos { propertyId }
 *   property-photo-upload  staff, the building's photo      { propertyId }
 *   lockbox-photo-upload   staff, a unit's lockbox photo    { propertyId }
 *   portal-contact-upload  a contractor, their W-9 or insurance { contactId, docKind, fileKind }
 *   contact-upload         staff, a contractor's W-9 or insurance { contactId, docKind, fileKind }
 *   lease-upload           staff, a lease's signed term     { leaseId, termId, fileKind }
 *   invoice-upload         staff, an invoice's files        { invoiceId, fileKind }
 *   portal-invoice-upload  a contractor's Send invoice      { taskId, fileKind }, parentId "<taskId>:<contactId>"
 *   new-task-upload        staff, New task's files before Create { formId, fileKind }
 *
 * A contact document's parentId is "<contactId>:<docKind>" (contactDocParent), so the W-9 and the insurance are
 * two targets in the queue, each with its own folder. A signed lease's is "<leaseId>:<termId>" (leaseDocParent), so
 * each term is its own target; they share the lease's folder.
 */
export const UPLOAD_KINDS = [
  "task-upload",
  "portal-task-upload",
  "property-upload",
  "listing-photo-upload",
  "property-photo-upload",
  "lockbox-photo-upload",
  "portal-contact-upload",
  "contact-upload",
  "lease-upload",
  "invoice-upload",
  "portal-invoice-upload",
  "resident-upload",
  "new-task-upload",
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

/** The clientPayload key naming the row each kind uploads to, which the token route checks. */
export const UPLOAD_KIND_PARENT: Record<UploadKind, "taskId" | "propertyId" | "contactId" | "leaseId" | "invoiceId" | "linkId" | "formId"> = {
  "task-upload": "taskId",
  "portal-task-upload": "taskId",
  "property-upload": "propertyId",
  "listing-photo-upload": "propertyId",
  "property-photo-upload": "propertyId",
  "lockbox-photo-upload": "propertyId",
  "portal-contact-upload": "contactId",
  "contact-upload": "contactId",
  "lease-upload": "leaseId",
  "invoice-upload": "invoiceId",
  // The job it's sent from: the invoice doesn't exist until the send (docs/contractor-invoices-plan.md, 5.2).
  "portal-invoice-upload": "taskId",
  // A resident's request link (docs/specs/maintenance-requests.md): files go up before the request exists.
  "resident-upload": "linkId",
  // New task's files (docs/specs/new-task-checklist-photos.md): they go up before the task exists, under the form's id.
  "new-task-upload": "formId",
};

/** Listing and property photos are public Blob (the public site and PhotoThumb read them); everything else is private, the lockbox photo included. */
export const UPLOAD_KIND_ACCESS: Record<UploadKind, "private" | "public"> = {
  "task-upload": "private",
  "portal-task-upload": "private",
  "property-upload": "private",
  "listing-photo-upload": "public",
  "property-photo-upload": "public",
  "lockbox-photo-upload": "private",
  "portal-contact-upload": "private",
  "contact-upload": "private",
  "lease-upload": "private",
  "invoice-upload": "private",
  "portal-invoice-upload": "private",
  "resident-upload": "private",
  "new-task-upload": "private",
};

/**
 * What each kind accepts, by file kind: the one table the uploader's check,
 * the token route and the record steps read (uploads 2.1: the server stops
 * trusting the browser's size and type). Staff task uploads take photos,
 * videos and documents; a contractor, photos and videos; property documents,
 * documents and photos; the two public kinds, photos only. The caps per file
 * kind are UPLOAD_RULES (content-types.ts).
 */
export const UPLOAD_KIND_ALLOWED: Record<UploadKind, readonly FileKind[]> = {
  "task-upload": ["image", "video", "file"],
  "portal-task-upload": ["image", "video"],
  "property-upload": ["image", "file"],
  "listing-photo-upload": ["image"],
  "property-photo-upload": ["image"],
  "lockbox-photo-upload": ["image"],
  // A W-9 or a policy: a phone photo or a PDF.
  "portal-contact-upload": ["image", "file"],
  // One that came by email: a phone photo or a PDF, as the contractor's own.
  "contact-upload": ["image", "file"],
  // A signed lease: the PDF, or a phone photo of the pages.
  "lease-upload": ["image", "file"],
  // An invoice: a PDF or a photo of it (limits.ts INVOICE_FILE_RULES narrows documents to PDF).
  "invoice-upload": ["image", "file"],
  "portal-invoice-upload": ["image", "file"],
  // A resident's request: photos and videos.
  "resident-upload": ["image", "video"],
  // What a staff task upload takes, since they become the task's files.
  "new-task-upload": ["image", "video", "file"],
};

/** The kinds whose record step keeps a thumbnail and a video poster (TaskAttachment.thumbPathname, posterPathname). */
export const UPLOAD_KIND_PREVIEWS: Record<UploadKind, boolean> = {
  "task-upload": true,
  "portal-task-upload": true,
  "property-upload": false,
  "listing-photo-upload": false,
  "property-photo-upload": false,
  // A thumbnail for the sheet's tile, the Units list and the job page, so a phone at the door loads ~1024px, not 2560.
  "lockbox-photo-upload": true,
  "portal-contact-upload": false,
  "contact-upload": false,
  "lease-upload": false,
  "invoice-upload": false,
  "portal-invoice-upload": false,
  "resident-upload": true,
  "new-task-upload": true,
};

export function isUploadKind(kind: unknown): kind is UploadKind {
  return typeof kind === "string" && (UPLOAD_KINDS as readonly string[]).includes(kind);
}

/**
 * The queue key of a kind's target for one row (uploads 2.1): "task:<id>",
 * "portal-task:<id>", "property-doc:<id>", "listing:<id>",
 * "property-photo:<id>". The task options of useMediaUploader, which name no
 * target, get theirs from here.
 */
export function uploadTargetKey(kind: UploadKind, parentId: string): string {
  const prefix: Record<UploadKind, string> = {
    "task-upload": "task",
    "portal-task-upload": "portal-task",
    "property-upload": "property-doc",
    "listing-photo-upload": "listing",
    "property-photo-upload": "property-photo",
    "lockbox-photo-upload": "lockbox-photo",
    "portal-contact-upload": "portal-contact",
    "contact-upload": "contact-doc",
    "lease-upload": "lease-doc",
    "invoice-upload": "invoice",
    "portal-invoice-upload": "portal-invoice",
    "resident-upload": "resident",
    "new-task-upload": "new-task",
  };
  return `${prefix[kind]}:${parentId}`;
}

/** The page where a target's files land, for a toast's View. */
export function uploadTargetHref(kind: UploadKind, parentId: string): string {
  const id = encodeURIComponent(parentId);
  switch (kind) {
    case "task-upload":
      return `/tasks/${id}`;
    case "portal-task-upload":
      return `/p/jobs/${id}`;
    case "portal-contact-upload":
      return "/p/setup";
    case "contact-upload":
      return `/contractors/${encodeURIComponent(readContactDocParent(parentId)?.contactId ?? "")}`;
    case "lease-upload":
      return `/tenants/${encodeURIComponent(readLeaseDocParent(parentId)?.leaseId ?? "")}`;
    case "invoice-upload":
      return `/invoices/${id}`;
    case "portal-invoice-upload":
      return `/p/jobs/${encodeURIComponent(readInvoiceSendParent(parentId)?.taskId ?? "")}`;
    case "resident-upload":
      // The resident's pages carry their link; a toast has nowhere else to send them.
      return "";
    case "new-task-upload":
      // The form they wait on; once Create ran they join the task.
      return "/tasks/new";
    default:
      return `/properties/${id}`;
  }
}

/** What the browser asks Blob for: the path, and the payload the token route reads. */
export interface UploadRequest {
  pathname: string;
  clientPayload: string;
}

/**
 * The path and token payload for one file. `name` is the stored name
 * (media.ts storedNames), so a camera file's path is its dated slug. Task
 * files go to tasks/<taskId>/<role>/<safe name> with their fileKind, which the
 * token route checks (a thumbnail or poster is role "thumb" or "poster" and
 * always an image); property documents to properties/<propertyId>/<safe name>
 * with their fileKind, so the token holds each to its own cap; listing photos
 * to their bare slug; the property photo under properties/<propertyId>/photo/;
 * a unit's lockbox photo under properties/<propertyId>/lockbox/, its
 * thumbnail in that folder's thumb/.
 * `queuedAt` rides in a contractor's payload so the token route can apply the
 * late-upload rule when it mints a resumed upload a fresh token. `owner` is
 * the queue's scope (queue-owner.ts), in every kind's payload, so the route
 * can refuse a token asked for by a queue that isn't the signed-in person's.
 */
export function uploadRequest(
  kind: UploadKind,
  parentId: string,
  file: { name: string; contentType: string; fileKind: FileKind },
  opts: { role?: UploadRole; queuedAt?: string; owner?: string } = {},
): UploadRequest {
  const role = opts.role ?? "orig";
  const slug = uploadSlug(file.name);
  const owned = (payload: Record<string, string>): string => JSON.stringify(opts.owner ? { ...payload, owner: opts.owner } : payload);
  switch (kind) {
    case "task-upload":
    case "portal-task-upload": {
      const payload: Record<string, string> = { taskId: parentId, fileKind: file.fileKind };
      if (kind === "portal-task-upload" && opts.queuedAt) payload.queuedAt = opts.queuedAt;
      return { pathname: taskUploadPath(parentId, slug, role, file.contentType), clientPayload: owned(payload) };
    }
    case "property-upload":
      return { pathname: `properties/${parentId}/${slug}`, clientPayload: owned({ propertyId: parentId, fileKind: file.fileKind }) };
    case "listing-photo-upload":
      return { pathname: slug, clientPayload: owned({ propertyId: parentId }) };
    case "property-photo-upload":
      return { pathname: `properties/${parentId}/photo/${slug}`, clientPayload: owned({ propertyId: parentId }) };
    case "lockbox-photo-upload":
      return {
        pathname: `properties/${parentId}/lockbox/${role === "thumb" ? "thumb/" : ""}${slug}`,
        clientPayload: owned({ propertyId: parentId }),
      };
    case "portal-contact-upload":
    case "contact-upload": {
      const parent = readContactDocParent(parentId);
      const contactId = parent?.contactId ?? "";
      const docKind = parent?.docKind ?? "w9";
      return { pathname: `contacts/${contactId}/${docKind}/${slug}`, clientPayload: owned({ contactId, docKind, fileKind: file.fileKind }) };
    }
    case "resident-upload":
      // The resident's link rides in `owner` (queue-owner.ts residentScope), which the token route reads.
      return { pathname: residentUploadPath(parentId, slug, role, file.contentType), clientPayload: owned({ linkId: parentId, fileKind: file.fileKind }) };
    case "new-task-upload":
      return { pathname: newTaskUploadPath(parentId, slug, role, file.contentType), clientPayload: owned({ formId: parentId, fileKind: file.fileKind }) };
    case "lease-upload": {
      const parent = readLeaseDocParent(parentId);
      const leaseId = parent?.leaseId ?? "";
      return { pathname: `leases/${leaseId}/${slug}`, clientPayload: owned({ leaseId, termId: parent?.termId ?? "", fileKind: file.fileKind }) };
    }
    case "invoice-upload":
      return { pathname: `${invoiceUploadFolder(kind, parentId) ?? "invoices/"}${slug}`, clientPayload: owned({ invoiceId: parentId, fileKind: file.fileKind }) };
    case "portal-invoice-upload": {
      // parentId is "<taskId>:<contactId>" (limits.ts invoiceSendParent); the token route checks the contractor is who's signed in.
      const taskId = readInvoiceSendParent(parentId)?.taskId ?? "";
      return { pathname: `${invoiceUploadFolder(kind, parentId) ?? "invoice-sends/"}${slug}`, clientPayload: owned({ taskId, fileKind: file.fileKind }) };
    }
  }
}

/** A contractor document's folder name: "w9" or "insurance". */
export type ContactDocFolder = "w9" | "insurance";

/** The parentId of a contractor's W-9 or insurance upload target. */
export function contactDocParent(contactId: string, docKind: ContactDocFolder): string {
  return `${contactId}:${docKind}`;
}

export function readContactDocParent(parentId: string): { contactId: string; docKind: ContactDocFolder } | null {
  const m = /^([A-Za-z0-9_-]{1,64}):(w9|insurance)$/.exec(parentId);
  return m ? { contactId: m[1], docKind: m[2] as ContactDocFolder } : null;
}

/** The parentId of a lease term's signed-lease upload target. */
export function leaseDocParent(leaseId: string, termId: string): string {
  return `${leaseId}:${termId}`;
}

export function readLeaseDocParent(parentId: string): { leaseId: string; termId: string } | null {
  const m = /^([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{1,64})$/.exec(parentId);
  return m ? { leaseId: m[1], termId: m[2] } : null;
}
