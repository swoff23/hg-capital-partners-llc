import { uploadSlug } from "./media";
import { taskUploadPath, type UploadRole } from "./paths";
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
 */
export const UPLOAD_KINDS = [
  "task-upload",
  "portal-task-upload",
  "property-upload",
  "listing-photo-upload",
  "property-photo-upload",
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

/** The clientPayload key naming the row each kind uploads to, which the token route checks. */
export const UPLOAD_KIND_PARENT: Record<UploadKind, "taskId" | "propertyId"> = {
  "task-upload": "taskId",
  "portal-task-upload": "taskId",
  "property-upload": "propertyId",
  "listing-photo-upload": "propertyId",
  "property-photo-upload": "propertyId",
};

/** Listing and property photos are public Blob (the public site and PhotoThumb read them); everything else is private. */
export const UPLOAD_KIND_ACCESS: Record<UploadKind, "private" | "public"> = {
  "task-upload": "private",
  "portal-task-upload": "private",
  "property-upload": "private",
  "listing-photo-upload": "public",
  "property-photo-upload": "public",
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
};

/** The kinds whose record step keeps a thumbnail and a video poster (TaskAttachment.thumbPathname, posterPathname). */
export const UPLOAD_KIND_PREVIEWS: Record<UploadKind, boolean> = {
  "task-upload": true,
  "portal-task-upload": true,
  "property-upload": false,
  "listing-photo-upload": false,
  "property-photo-upload": false,
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
 * to their bare slug; the property photo under properties/<propertyId>/photo/.
 * `queuedAt` rides in a contractor's payload so the token route can apply the
 * late-upload rule when it mints a resumed upload a fresh token.
 */
export function uploadRequest(
  kind: UploadKind,
  parentId: string,
  file: { name: string; contentType: string; fileKind: FileKind },
  opts: { role?: UploadRole; queuedAt?: string } = {},
): UploadRequest {
  const role = opts.role ?? "orig";
  const slug = uploadSlug(file.name);
  switch (kind) {
    case "task-upload":
    case "portal-task-upload": {
      const payload: Record<string, string> = { taskId: parentId, fileKind: file.fileKind };
      if (kind === "portal-task-upload" && opts.queuedAt) payload.queuedAt = opts.queuedAt;
      return { pathname: taskUploadPath(parentId, slug, role, file.contentType), clientPayload: JSON.stringify(payload) };
    }
    case "property-upload":
      return {
        pathname: `properties/${parentId}/${slug}`,
        clientPayload: JSON.stringify({ propertyId: parentId, fileKind: file.fileKind }),
      };
    case "listing-photo-upload":
      return { pathname: slug, clientPayload: JSON.stringify({ propertyId: parentId }) };
    case "property-photo-upload":
      return { pathname: `properties/${parentId}/photo/${slug}`, clientPayload: JSON.stringify({ propertyId: parentId }) };
  }
}
