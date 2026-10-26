/**
 * The HEIC fallback for photos going public (docs/specs/uploads-photos.md
 * 2.1 and question 6a): a listing photo or the property photo picked on a
 * desktop browser that can't decode an iPhone's HEIC. Every iPhone decodes it
 * itself through createImageBitmap, so the prepare step (lib/attachments/
 * prepare.ts, UP1) only comes here when that fails.
 *
 * The decoder is heic-to, libheif compiled to WebAssembly, about 3 MB. It is
 * LGPL-3.0, so it ships unmodified as its own chunk: this file is the only
 * place that reaches it, through the dynamic import below, and eslint refuses
 * a static import of "heic-to" anywhere (eslint.config.mjs), so it never
 * lands in a page's bundle. Pure apart from that import; see heic.test.ts.
 */

/** The ISO BMFF brands HEIC and HEIF files carry at bytes 8 to 12 (image and sequence, HEVC and others). */
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"]);

/**
 * Whether a file's first bytes say HEIC or HEIF: "ftyp" at 4 and a HEIF
 * brand at 8. Reads the bytes, not the name or the browser's type, since
 * Windows Chrome reports neither for an iPhone photo.
 */
export function looksLikeHeic(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  return ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12).toLowerCase());
}

/** Reads a file's first 12 bytes and checks them (looksLikeHeic). Never loads the decoder. */
export async function isHeicFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return looksLikeHeic(head);
}

/**
 * A HEIC photo as a JPEG, decoded in the browser. Loads the decoder on first
 * use (its own chunk; the browser caches it after). Throws when the file
 * can't be decoded, for the caller's one-line refusal.
 */
export async function heicToJpeg(file: Blob, quality = 0.85): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality });
}
