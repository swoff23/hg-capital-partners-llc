import { heicToJpeg, isHeicFile } from "./heic";
import { withExtension } from "./media";
import type { FileKind } from "./content-types";

/**
 * The step between picking a file and sending its bytes (docs/specs/
 * uploads-photos.md 2.1): every photo the browser can decode gets a JPEG
 * thumbnail at 1024px on the long edge, every video a poster frame, and a
 * "display" target (listing photos, the property photo and, with question 3,
 * a contractor's photos) re-encodes the photo itself to a 2560px JPEG at 0.85.
 * That drops GPS and every other tag (G1D-027) and turns HEIC into JPEG
 * wherever the browser can read it, as every iPhone can (G1D-010); a desktop
 * browser that can't takes heic.ts's fallback. createImageBitmap applies the
 * camera's orientation, so a portrait shot goes up upright.
 *
 * The sizing math is pure and tested (prepare.test.ts). The rest needs a
 * browser (canvas, video, createImageBitmap) and is only called from the
 * upload engine; anything it can't do for a thumbnail or a poster is left out
 * and the upload goes on, since both are only a convenience for the grid.
 */

/** A "display" photo's long edge, and its JPEG quality. */
export const DISPLAY_EDGE = 2560;
export const DISPLAY_QUALITY = 0.85;
/** The size schema.prisma documents for thumbnails (TaskAttachment.thumbPathname). */
export const THUMB_EDGE = 1024;
export const THUMB_QUALITY = 0.8;

export type PrepareMode = "original" | "display";

/**
 * A size fitted inside `edge` on its long side, never upscaled, rounded to
 * whole pixels and at least 1. 4032x3024 at 2560 is 2560x1920; 800x600
 * stays 800x600.
 */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long <= edge) return { width: w, height: h };
  const scale = edge / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** What a file needs before it goes up. */
export type PreparePlan = {
  /** Make a 1024px JPEG thumbnail (a photo whose record step keeps one). */
  thumb: boolean;
  /** Take a poster frame (a video whose record step keeps one). */
  poster: boolean;
  /** Re-encode the photo itself to a 2560px JPEG with no metadata. */
  display: boolean;
};

/**
 * `previews` is whether this kind's record step stores a thumbnail and a
 * poster (task files do; property documents and public photos don't).
 */
export function planPrepare(input: { fileKind: FileKind; mode: PrepareMode; previews: boolean }): PreparePlan {
  const photo = input.fileKind === "image";
  return {
    thumb: photo && input.previews,
    poster: input.fileKind === "video" && input.previews,
    display: photo && input.mode === "display",
  };
}

/**
 * Whether a photo the browser can't decode gets the HEIC fallback: only a
 * photo going to a public page (`strict`). The fallback is a 3 MB chunk, and a
 * contractor's private photo is wanted as it is; it never pulls the chunk
 * over a phone's data (question 6a).
 */
export function heicFallbackApplies(plan: PreparePlan, strict: boolean): boolean {
  return plan.display && strict;
}

export type MediaMeta = { width?: number; height?: number; durationSec?: number };

/** What goes up for one picked file, and the extras that go with it. */
export type Prepared = {
  /** The bytes to send: the file as picked, or the display JPEG. */
  blob: Blob;
  /** The stored name: a display photo's extension is .jpg. */
  name: string;
  contentType: string;
  thumb: Blob | null;
  poster: Blob | null;
  meta: MediaMeta;
};

/** A photo that has to be re-encoded and can't be read here. The message is the reason, for "<n> photos didn't upload: <reason>". */
export class PrepareError extends Error {}

/** The reason a public photo gives when it can't be re-encoded: sent as picked it would keep its GPS. */
export const UNREADABLE_PHOTO = "this photo can't be read here. Try a JPEG";

const META_TIMEOUT_MS = 3000;
const POSTER_TIMEOUT_MS = 5000;

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function decode(file: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    // Upright, as the camera held it. A browser that doesn't know the option applies it anyway or throws; either way the plain call below is the same decode.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

function toJpeg(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, edge: number, quality: number): Promise<Blob | null> {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, edge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // JPEG has no alpha: a transparent PNG would turn black.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      // Frees the canvas's memory at once; a phone keeps several of these alive otherwise.
      canvas.width = 0;
      canvas.height = 0;
      resolve(blob);
    }, "image/jpeg", quality),
  );
}

/** Size of a photo the bitmap path couldn't open, from an <img>, when the browser can show it at all. */
function imageSize(file: Blob): Promise<MediaMeta> {
  const url = URL.createObjectURL(file);
  const read = new Promise<MediaMeta>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
    img.onerror = () => resolve({});
    img.src = url;
  });
  return Promise.race([read, timeout(META_TIMEOUT_MS, {} as MediaMeta)]).finally(() => URL.revokeObjectURL(url));
}

/** A video's size and length, and a frame for its poster when asked. Neither blocks an upload for long. */
async function readVideo(file: Blob, wantPoster: boolean): Promise<{ meta: MediaMeta; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = wantPoster ? "auto" : "metadata";
  try {
    const meta = await Promise.race([
      new Promise<MediaMeta>((resolve) => {
        video.onloadedmetadata = () =>
          resolve({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            durationSec: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
          });
        video.onerror = () => resolve({});
        video.src = url;
      }),
      timeout(META_TIMEOUT_MS, {} as MediaMeta),
    ]);
    if (!wantPoster || !meta.width || !meta.height) return { meta, poster: null };
    const poster = await Promise.race([
      new Promise<Blob | null>((resolve) => {
        video.onseeked = () => void toJpeg(video, meta.width!, meta.height!, THUMB_EDGE, THUMB_QUALITY).then(resolve, () => resolve(null));
        video.onerror = () => resolve(null);
        // A tenth of the way in, at most a second: past a fade-in, before a short clip ends.
        video.currentTime = Math.min(1, (meta.durationSec ?? 1) * 0.1);
      }),
      timeout(POSTER_TIMEOUT_MS, null),
    ]);
    return { meta, poster };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepares one file. `name` and `contentType` are the stored name and the
 * type the check settled on. A display photo that can't be re-encoded throws a
 * PrepareError when it's `strict` (a public photo: sent as picked it would
 * carry its GPS to the public site) and otherwise, like everything else that
 * fails here, degrades to "as picked, no preview" (a contractor's photo is
 * private and still wanted).
 */
export async function prepareFile(
  file: File,
  input: { name: string; contentType: string; fileKind: FileKind; mode: PrepareMode; previews: boolean; strict?: boolean },
): Promise<Prepared> {
  const plan = planPrepare(input);
  const asPicked: Prepared = { blob: file, name: input.name, contentType: input.contentType, thumb: null, poster: null, meta: {} };

  if (input.fileKind === "video") {
    const { meta, poster } = await readVideo(file, plan.poster);
    return { ...asPicked, meta, poster };
  }
  if (input.fileKind !== "image") return asPicked;

  let source: Blob = file;
  let bitmap = await decode(file);
  // A desktop browser can't open an iPhone's HEIC; a photo going public converts it with the fallback (a 3 MB chunk, loaded
  // only here). A contractor's private photo never pulls it: it goes up as picked (question 6a).
  if (!bitmap && heicFallbackApplies(plan, !!input.strict) && ((await isHeicFile(file)) || /hei[cf]$/.test(input.contentType))) {
    try {
      source = await heicToJpeg(file, DISPLAY_QUALITY);
      bitmap = await decode(source);
    } catch {
      bitmap = null;
    }
  }

  if (!bitmap) {
    if (plan.display && input.strict) throw new PrepareError(UNREADABLE_PHOTO);
    return { ...asPicked, meta: plan.thumb ? await imageSize(file) : {} };
  }

  try {
    const meta: MediaMeta = { width: bitmap.width, height: bitmap.height };
    const thumb = plan.thumb ? await toJpeg(bitmap, bitmap.width, bitmap.height, THUMB_EDGE, THUMB_QUALITY) : null;
    if (!plan.display) return { ...asPicked, meta, thumb };
    const display = await toJpeg(bitmap, bitmap.width, bitmap.height, DISPLAY_EDGE, DISPLAY_QUALITY);
    if (!display) {
      if (input.strict) throw new PrepareError(UNREADABLE_PHOTO);
      return { ...asPicked, meta, thumb };
    }
    const size = fitWithin(bitmap.width, bitmap.height, DISPLAY_EDGE);
    return { blob: display, name: withExtension(input.name, "jpg"), contentType: "image/jpeg", thumb, poster: null, meta: size };
  } finally {
    bitmap.close();
  }
}
