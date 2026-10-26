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
 * a text file and a video can't sit at "clip.jpg".
 */
export function uploadLimits(taskId: string, pathname: string, fileKind: unknown): TokenLimits | string {
  const role = requestedUploadRole(pathname, taskId);
  if (!role) return "That upload path isn't allowed.";
  if (!isFileKind(fileKind)) return "fileKind must be image, video or file.";
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
export type PropertyUploadKind = "property-upload" | "listing-photo-upload" | "property-photo-upload";

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
