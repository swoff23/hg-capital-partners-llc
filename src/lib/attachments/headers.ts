import { contentDisposition } from "@/lib/http";
import { filenameForType, normalizeContentType } from "./content-types";

/**
 * Response headers for /api/files. Pure; see headers.test.ts.
 *
 * - Always nosniff, so a mislabeled upload is never run as something else.
 * - A sandbox CSP on everything but PDFs, so even a stored HTML or SVG file
 *   can't run script on our origin. PDFs get default-src 'none' alone, since
 *   the sandbox stops browsers' built-in viewers.
 * - Only images, videos and PDFs open in the tab; everything else downloads.
 *   SVG downloads too: it's an image that can carry script.
 * - The saved name agrees with the type (filenameForType), so a text file
 *   uploaded as "Invoice.html" saves as "Invoice.txt", older rows included.
 * - Cached by the browser only (`private`), never by the CDN, so every first
 *   fetch runs the access check. A file id never changes its bytes, hence
 *   immutable.
 */

export const FILE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** Ten minutes: long enough to start a video, short enough that a copied link soon dies. */
export const SIGNED_VIDEO_TTL_MS = 10 * 60 * 1000;

export function opensInline(contentType: string | null | undefined): boolean {
  const t = normalizeContentType(contentType);
  if (t === "image/svg+xml") return false;
  return t.startsWith("image/") || t.startsWith("video/") || t === "application/pdf";
}

export interface FileHeaderInput {
  contentType: string | null | undefined;
  filename: string;
  /** Content-Length, when the upstream gave one. */
  size?: number | string | null;
  /** The saving link (`?download=1`): always an attachment, even for what would open in the tab. */
  download?: boolean;
}

export function fileResponseHeaders({ contentType, filename, size, download = false }: FileHeaderInput): Record<string, string> {
  const type = normalizeContentType(contentType) || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Disposition": contentDisposition(filenameForType(filename, type), opensInline(type) && !download ? "inline" : "attachment"),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": type === "application/pdf" ? "default-src 'none'" : "sandbox; default-src 'none'",
    "Cache-Control": FILE_CACHE_CONTROL,
  };
  const len = size == null ? "" : String(size);
  if (/^\d+$/.test(len)) headers["Content-Length"] = len;
  return headers;
}

/**
 * The name a thumbnail or poster is served under, so a saved preview doesn't
 * pose as the original: "Roof leak.mov" with a .jpg poster is "Roof leak-poster.jpg".
 */
export function previewName(filename: string, variant: "thumb" | "poster", pathname: string): string {
  const ext = /\.[A-Za-z0-9]+$/.exec(pathname)?.[0] ?? "";
  return `${filename.replace(/\.[^.]+$/, "")}-${variant}${ext}`;
}

/** The 302 to a signed video URL: the URL expires, so the redirect itself is never cached. */
export function signedRedirectHeaders(location: string): Record<string, string> {
  return {
    Location: location,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Referrer-Policy": "no-referrer",
  };
}

/** Errors (401, 404) carry the same guards and are never cached. */
export const ERROR_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};

/** A single byte range ("bytes=0-", "bytes=100-199") passed through to Blob; anything else is ignored. */
export function singleByteRange(header: string | null | undefined): string | null {
  const h = (header ?? "").trim();
  return /^bytes=(\d+-\d*|-\d+)$/.test(h) ? h : null;
}
