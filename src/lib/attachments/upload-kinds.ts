import { safeUploadName, taskUploadPath } from "./paths";
import type { FileKind } from "./content-types";

/**
 * The upload kinds: each one is a /api/blob/[kind] token route, so the key a
 * surface passes (`UploadTarget.uploadKind`, `useMediaUploader`) is the
 * route's own key. Fixed here for every target the uploads spec names
 * (docs/specs/uploads-photos.md 2.1, build plan 1.5), so callers and the
 * route agree before each kind's route lands; the route types its table
 * against this list. Pure; see upload-kinds.test.ts.
 *
 *   task-upload            staff, a task's files            { taskId, fileKind }
 *   portal-task-upload     a contractor, on a job           { taskId, fileKind }
 *   property-upload        staff, a property's documents    { propertyId }
 *   listing-photo-upload   staff, a listing's public photos { propertyId }
 *   property-photo-upload  staff, the building's photo      { propertyId }  (the route adds it with UP1)
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

export function isUploadKind(kind: unknown): kind is UploadKind {
  return typeof kind === "string" && (UPLOAD_KINDS as readonly string[]).includes(kind);
}

/** What the browser asks Blob for: the path, and the payload the token route reads. */
export interface UploadRequest {
  pathname: string;
  clientPayload: string;
}

/**
 * The path and token payload for one file, as each surface asks for them
 * today: task files at tasks/<taskId>/orig/<safe name> with their fileKind
 * (the token route checks both), property documents at
 * properties/<propertyId>/<name>, listing photos at their bare name. The
 * property photo, which has no route yet, goes under
 * properties/<propertyId>/photo/. The engine (UP1) may give the property
 * kinds their own path rules; the payload keys stay the route's.
 */
export function uploadRequest(
  kind: UploadKind,
  parentId: string,
  file: { name: string; contentType: string; fileKind: FileKind },
): UploadRequest {
  const parent = UPLOAD_KIND_PARENT[kind];
  const clientPayload = JSON.stringify(
    parent === "taskId" ? { taskId: parentId, fileKind: file.fileKind } : { propertyId: parentId },
  );
  switch (kind) {
    case "task-upload":
    case "portal-task-upload":
      return { pathname: taskUploadPath(parentId, file.name, "orig", file.contentType), clientPayload };
    case "property-upload":
      return { pathname: `properties/${parentId}/${file.name}`, clientPayload };
    case "listing-photo-upload":
      return { pathname: file.name, clientPayload };
    case "property-photo-upload":
      return { pathname: `properties/${parentId}/photo/${safeUploadName(file.name)}`, clientPayload };
  }
}
