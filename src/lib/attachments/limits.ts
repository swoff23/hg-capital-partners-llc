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
