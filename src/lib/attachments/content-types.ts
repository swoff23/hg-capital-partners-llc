/**
 * What a task upload may be, by kind. One table shared by the token route
 * (what Blob will accept), the record step (what head() must report) and the
 * uploader (a check before the bytes leave the phone). Pure; see
 * content-types.test.ts.
 *
 * Never SVG or HTML: both can carry script. HEIC and HEIF are kept so iPhone
 * photos aren't lost, even though most browsers can't show them inline.
 */

export const FILE_KINDS = ["image", "video", "file"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export interface UploadRule {
  contentTypes: readonly string[];
  maxBytes: number;
}

const MB = 1024 * 1024;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const UPLOAD_RULES: Record<FileKind, UploadRule> = {
  image: { contentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"], maxBytes: 25 * MB },
  video: { contentTypes: ["video/mp4", "video/quicktime"], maxBytes: 500 * MB },
  file: { contentTypes: ["application/pdf", DOCX, XLSX, "text/csv", "text/plain"], maxBytes: 50 * MB },
};

/** Thumbnails and video posters: stills every browser can draw. */
export const PREVIEW_RULE: UploadRule = { contentTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 25 * MB };

/**
 * Above this the uploader sends parts in parallel, each retried on its own,
 * so a 30 to 70 MB phone video on a weak signal resends one 8 MB part, not
 * the whole file. Blob's parts are 8 MB (and must be at least 5 MB), so
 * anything smaller goes in one request.
 */
export const MULTIPART_THRESHOLD = 8 * MB;

/** Whether a file this size goes up in parts (over MULTIPART_THRESHOLD). */
export function usesMultipart(size: number): boolean {
  return size > MULTIPART_THRESHOLD;
}

/** "Image/JPEG; charset=x" → "image/jpeg". Anything that isn't a plain type/subtype is "". */
export function normalizeContentType(type: string | null | undefined): string {
  const t = (type ?? "").split(";")[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(t) ? t : "";
}

/** The kind whose allowlist holds this type, or null when uploads of it are refused. */
export function fileKindForType(type: string | null | undefined): FileKind | null {
  const t = normalizeContentType(type);
  return FILE_KINDS.find((k) => UPLOAD_RULES[k].contentTypes.includes(t)) ?? null;
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
  docx: DOCX,
  xlsx: XLSX,
  csv: "text/csv",
  txt: "text/plain",
};

/** An allowed type from the file name's extension alone, or null. */
export function contentTypeForName(filename: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(filename.trim())?.[1]?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || null;
}

/**
 * The type to upload a file as. The browser's own type when it's one we
 * accept; otherwise the extension's. That covers a HEIC with no type at all
 * (Chrome on Windows) and a CSV reported as application/vnd.ms-excel. Null
 * when neither is allowed.
 */
export function uploadContentType(filename: string, browserType: string | null | undefined): string | null {
  const t = normalizeContentType(browserType);
  return fileKindForType(t) ? t : contentTypeForName(filename);
}

/** The extension a saved file of each allowed type gets. */
const CANONICAL_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  [DOCX]: "docx",
  [XLSX]: "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};

/**
 * Controls (C0, DEL, C1) and the invisible marks that can disguise a name:
 * zero-width characters, bidi embeddings and overrides ("photo<U+202E>gpj.exe"
 * reads as "photoexe.jpg"), bidi isolates, the word joiner and BOM.
 */
const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f؜​-‏‪-‮⁠-⁩﻿]/g;

/** TaskAttachment.filename keeps 255 characters. */
const MAX_FILENAME = 255;

/** A real extension has a letter in it, so "Bid v1.2" keeps its ".2". */
export function nameExtension(name: string): string | null {
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(name)?.[1];
  return ext && /[A-Za-z]/.test(ext) ? ext : null;
}

/**
 * The name a file is shown and saved under, made to agree with its verified
 * type. Hidden characters are stripped, and an extension that doesn't name
 * the type is swapped for the type's own: "Invoice.html" stored as text/plain
 * is "Invoice.txt", and "Kitchen" stored as image/jpeg is "Kitchen.jpg". A
 * type outside the allowlist (an older row) keeps its name. At most 255
 * characters, extension included.
 */
export function filenameForType(filename: string, contentType: string | null | undefined): string {
  const type = normalizeContentType(contentType);
  const clean = filename.replace(HIDDEN_CHARS, "").trim().replace(/[\s.]+$/, "");
  const canonical = CANONICAL_EXT[type];
  if (!canonical) return (clean || "file").slice(0, MAX_FILENAME);
  const ext = nameExtension(clean);
  const keep = ext !== null && EXTENSION_TYPES[ext.toLowerCase()] === type ? ext : null;
  const stem = (ext ? clean.slice(0, -(ext.length + 1)) : clean).replace(/[\s.]+$/, "") || "file";
  const finalExt = keep ?? canonical;
  return `${stem.slice(0, MAX_FILENAME - finalExt.length - 1)}.${finalExt}`;
}
