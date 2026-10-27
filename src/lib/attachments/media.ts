import { isOfflineError } from "@/lib/action-result";
import { HG_TIME_ZONE, fmtDay, todayYmdEastern } from "@/lib/dates";
import { FILE_KINDS, UPLOAD_RULES, contentTypeForName, fileKindForType, nameExtension, uploadContentType, type FileKind } from "./content-types";
import { safeUploadName } from "./paths";

/**
 * Browser-side helpers for task photos and videos: the check a file gets
 * before any bytes leave the phone, the one-line notice for a batch that
 * failed, and display bits for the grid and lightbox. The server checks
 * everything again (attachments/limits.ts, tasks/service.ts). Pure; see
 * media.test.ts.
 */

/** What the camera button asks for. iOS offers "Take Photo or Video". */
export const CAMERA_ACCEPT = "image/*,video/*";

// What the file picker asks for, per kind: types first, then the extensions
// that catch HEIC and MOV a browser can't type, and documents a phone only
// offers from Files when they're named.
const ACCEPT: Record<FileKind, { types: readonly string[]; extensions: readonly string[] }> = {
  image: { types: ["image/*"], extensions: [".heic", ".heif"] },
  video: { types: ["video/*"], extensions: [".mov", ".mp4"] },
  file: { types: UPLOAD_RULES.file.contentTypes, extensions: [".pdf", ".docx", ".xlsx", ".csv", ".txt"] },
};

/** The `accept` list for "Choose files" when these kinds are allowed. */
export function pickerAccept(allowed: readonly FileKind[] = ["image", "video"]): string {
  const kinds = FILE_KINDS.filter((k) => allowed.includes(k));
  return [...kinds.flatMap((k) => ACCEPT[k].types), ...kinds.flatMap((k) => ACCEPT[k].extensions)].join(",");
}

/** What "Choose files" asks for: photos and videos. */
export const MEDIA_ACCEPT = pickerAccept(["image", "video"]);

const MB = 1024 * 1024;

export type MediaCheck = { ok: true; contentType: string; fileKind: FileKind } | { ok: false; error: string };

const NOUN: Record<FileKind, string> = { image: "photo", video: "video", file: "file" };

/** "Only photos and videos", "Only photos", or "Only photos, videos and documents". */
function onlyLine(allowed: readonly FileKind[]): string {
  const nouns = allowed.map((k) => (k === "file" ? "documents" : `${NOUN[k]}s`));
  const list = nouns.length > 1 ? `${nouns.slice(0, -1).join(", ")} and ${nouns.at(-1)}` : nouns[0];
  return `only ${list} can be added here`;
}

/**
 * Whether a picked file may be uploaded here, and as what. Type from the
 * browser, or the extension when the browser has none (HEIC on Windows).
 * The error is the reason only, lowercase, for "<name>: <reason>" lines.
 */
export function checkMediaFile(
  file: { name: string; type: string; size: number },
  allowed: readonly FileKind[] = ["image", "video"],
): MediaCheck {
  const contentType = uploadContentType(file.name, file.type);
  const fileKind = fileKindForType(contentType);
  if (!contentType || !fileKind || !allowed.includes(fileKind)) return { ok: false, error: onlyLine(allowed) };
  if (file.size <= 0) return { ok: false, error: "the file is empty" };
  const cap = UPLOAD_RULES[fileKind].maxBytes;
  if (file.size > cap) return { ok: false, error: `over the ${Math.round(cap / MB)} MB ${NOUN[fileKind]} limit` };
  return { ok: true, contentType, fileKind };
}

/** The kind the upload was checked as; null when the check refused its type. The name's extension fills in. */
export type UploadFailure = { name: string; kind: FileKind | null; reason: string };

/**
 * @vercel/blob's upload() says "Failed to retrieve the client token" for any
 * refusal from /api/blob (session expired, job closed, type refused).
 */
const TOKEN_REFUSED = /client token/i;
/** The record step's message when no Blob store is connected (tasks/service.ts). */
const NO_BLOB_STORE = /not configured|Blob store/i;
/**
 * @vercel/blob's BlobServiceNotAvailable. Its multipart upload throws this
 * when a part's fetch fails ("Failed to fetch", "fetch failed"), where a
 * single PUT rethrows the browser's own TypeError.
 */
const BLOB_SERVICE_DOWN = /blob service is currently not available/i;
/**
 * @vercel/blob's BlobClientTokenExpiredError. A client token lasts an hour, so
 * a big video on a weak signal can outlive it: that is the clock, not a
 * refusal of the file.
 */
const TOKEN_EXPIRED = /client token has expired/i;

/** Whether an upload failed because its client token ran out. transfer.ts asks for another and carries on. */
export function isTokenExpired(e: unknown): boolean {
  return e instanceof Error && TOKEN_EXPIRED.test(e.message);
}

export function shownReason(reason: string): string {
  if (TOKEN_REFUSED.test(reason)) return "the upload was refused. Reload and try again";
  return reason;
}

/**
 * Why an upload to Blob failed, for the tile and the red line: "no connection"
 * for a dropped connection however it surfaced, else the error's own message.
 */
export function uploadFailureReason(e: unknown): string {
  if (isOfflineError(e) || (e instanceof Error && BLOB_SERVICE_DOWN.test(e.message))) return "no connection";
  return e instanceof Error ? e.message : "";
}

/**
 * One line for however many files failed, count first so the reason fits on
 * a phone: "2 photos didn't upload: no connection". Nouns as addedText words
 * them (a mix is "files"); the names are on each tile. Empty when none did.
 * `reason: false` is the count alone, "2 photos didn't upload", for a line
 * that carries its own Retry (the contractor's Mark done).
 */
export function uploadNotice(failures: UploadFailure[], { reason: withReason = true }: { reason?: boolean } = {}): string {
  if (failures.length === 0) return "";
  if (failures.some((f) => NO_BLOB_STORE.test(f.reason))) return "File uploads aren't set up yet.";
  const kinds = failures.map((f) => f.kind ?? fileKindForType(contentTypeForName(f.name)));
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  const count = `${failures.length} ${noun}${failures.length === 1 ? "" : "s"} didn't upload`;
  if (!withReason) return count;
  const reason = shownReason(failures[0].reason);
  // Different reasons can't share one line; each tile's label has its own.
  const same = failures.every((f) => shownReason(f.reason) === reason);
  return same && reason ? `${count}: ${reason}` : count;
}

/** "0:07", "4:32", "1:02:03". Empty for a missing or nonsense length. */
export function fmtDuration(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The gated route for a task file, or its thumbnail or poster. */
export function taskFileUrl(id: string, variant?: "thumb" | "poster"): string {
  const base = `/api/files/task/${encodeURIComponent(id)}`;
  return variant ? `${base}?v=${variant}` : base;
}

/**
 * Why a file didn't upload, as a file row says it (uploads 2.4): "No
 * connection", "Over the 50 MB limit", "This type can't be added". The
 * check's own reasons are lowercase clauses for "<name>: <reason>" lines.
 */
export function rowReason(reason: string | null | undefined): string {
  // A row has its own Retry beside this, so the tile's "Reload and try again" would argue with it.
  if (TOKEN_REFUSED.test(reason ?? "")) return "Upload refused";
  const r = shownReason((reason ?? "").trim());
  const over = /^over the (\d+) MB\b/.exec(r);
  if (over) return `Over the ${over[1]} MB limit`;
  if (/can be added here$/.test(r)) return "This type can't be added";
  if (!r) return "Didn't upload";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** A person's name as a byline gives it: the first name ("Connor"), or an email whole when that is all there is. */
export function bylineName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return n;
  return n.split(/\s+/)[0];
}

/**
 * "Oct 3", or "Oct 3, 2:14 PM" with `time`: when a file was added, by the
 * brand's one date formatter in Buffalo time wherever it renders, with the
 * year only when it isn't this year. "" for a missing or invalid instant.
 */
export function bylineStamp(at: Date | string | null | undefined, opts: { time?: boolean; now?: Date } = {}): string {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const day = fmtDay(todayYmdEastern(d), { year: "auto", now: todayYmdEastern(opts.now ?? new Date()) });
  if (!opts.time) return day;
  const time = d.toLocaleTimeString("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** "Connor · Oct 3" (or "Connor · Oct 3, 2:14 PM"): who added a file and when, either half alone when the other is unknown. */
export function byline(by: string | null | undefined, at: Date | string | null | undefined, opts: { time?: boolean; now?: Date } = {}): string {
  return [bylineName(by), bylineStamp(at, opts)].filter(Boolean).join(" · ");
}

/** The gated route for a property document. */
export function propertyFileUrl(id: string): string {
  return `/api/files/property/${encodeURIComponent(id)}`;
}

/**
 * The same route as a download: a video then saves instead of opening a tab
 * (the file route answers `?download=1` with a saving link, uploads 2.6).
 */
export function downloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

/* ---------------- Stored names (uploads 2.1, G1D-009) ---------------- */

/**
 * A name a camera or the browser gives every capture: "image.jpg",
 * "video.mov", "photo (3).jpg". They say nothing, so they are stored by date.
 * A real name ("Lease 2026.pdf", "IMG_6117.png") stays as it is.
 */
export function isGenericCameraName(name: string): boolean {
  return /^(?:image|photo|picture|video|movie)(?: ?\(\d+\))?\.[A-Za-z0-9]{1,10}$/i.test(name.trim());
}

const EASTERN_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: HG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

/** The Eastern wall clock of an instant: "2026-10-25" and "2.14 PM" (a period, not a colon: Windows refuses a colon in a saved name). */
function easternStamp(at: Date): { day: string; clock: string } {
  const parts = EASTERN_STAMP.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    clock: `${get("hour")}.${get("minute")} ${get("dayPeriod").toUpperCase()}`,
  };
}

/**
 * The stored name of a camera file: "Photo 2026-10-25 at 2.14 PM.jpg" or
 * "Video 2026-10-25 at 2.14 PM.mov", in Eastern time. The year is in it
 * because a stored name never updates, and the date comes first so names
 * sort. `n` above 1 is the file's place among others of the same minute in
 * one batch: " 2", " 3". A stored name is not a label; labels on screen go
 * through the brand's date formatter.
 */
export function datedName(kind: "image" | "video", takenAt: Date, ext: string, n = 1): string {
  const { day, clock } = easternStamp(takenAt);
  const noun = kind === "video" ? "Video" : "Photo";
  return `${noun} ${day} at ${clock}${n > 1 ? ` ${n}` : ""}.${ext.toLowerCase()}`;
}

/** What the picker gave for one file: its name, type and when it was taken (a capture's lastModified is its capture time). */
export type PickedFile = { name: string; type: string; lastModified?: number };

/**
 * The stored names for one batch, in pick order. Generic camera names become
 * dated names; photos in one batch that share a minute get " 2", " 3", so
 * every tile, viewer header and delete confirm names a different file. Real
 * names are kept (they may repeat; Blob keeps the paths apart). A dated name
 * keeps the extension it came with, or the type's when it has none.
 */
export function storedNames(files: readonly PickedFile[], now: Date = new Date()): string[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    if (f.name.trim() !== "" && !isGenericCameraName(f.name)) return f.name;
    const type = contentTypeForName(f.name) ?? f.type;
    const kind = type.startsWith("video/") ? "video" : "image";
    const ext = nameExtension(f.name) ?? (kind === "video" ? "mov" : "jpg");
    const taken = f.lastModified && f.lastModified > 0 ? new Date(f.lastModified) : now;
    const base = datedName(kind, taken, ext);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : datedName(kind, taken, ext, n);
  });
}

/** A name with its extension swapped: a converted photo, a thumbnail ("Photo 2026-10-25 at 2.14 PM.heic" to ".jpg"). */
export function withExtension(name: string, ext: string): string {
  const old = nameExtension(name);
  return `${old ? name.slice(0, -(old.length + 1)) : name}.${ext}`;
}

const DATED_NAME = /^(Photo|Video) (\d{4}-\d{2}-\d{2}) at (\d{1,2})\.(\d{2}) (AM|PM)(?: (\d+))?\.([A-Za-z0-9]+)$/;

/**
 * The path part of a stored name. A dated name becomes the slug
 * "photo-2026-10-25-214pm-2.jpg" (lowercase, no dots or spaces but the
 * extension's); any other name goes through safeUploadName.
 */
export function uploadSlug(name: string): string {
  const m = DATED_NAME.exec(name);
  if (!m) return safeUploadName(name);
  const [, noun, day, hour, minute, period, n, ext] = m;
  return `${noun.toLowerCase()}-${day}-${hour}${minute}${period.toLowerCase()}${n ? `-${n}` : ""}.${ext.toLowerCase()}`;
}

/**
 * "3 photos", "1 video", "3 photos and 1 video", "4 files": how a batch is
 * counted in a toast or a line. Anything with a document in it is "files".
 */
export function uploadCountPhrase(kinds: readonly (FileKind | null)[]): string {
  const photos = kinds.filter((k) => k === "image").length;
  const videos = kinds.filter((k) => k === "video").length;
  if (kinds.length > 0 && photos + videos === kinds.length) {
    const parts = [photos && `${photos} photo${photos === 1 ? "" : "s"}`, videos && `${videos} video${videos === 1 ? "" : "s"}`];
    return parts.filter(Boolean).join(" and ");
  }
  return `${kinds.length} ${kinds.length === 1 ? "file" : "files"}`;
}

/** What a document tile or row says it is: a short type label over a glyph. A photo kept as a document gets the image glyph. */
export type DocumentLook = { label: string; glyph: "text" | "sheet" | "image" };

export function documentLook(filename: string): DocumentLook {
  const ext = (nameExtension(filename) ?? "").toLowerCase();
  if (ext === "xlsx" || ext === "csv") return { label: ext.toUpperCase(), glyph: "sheet" };
  if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return { label: ext === "jpeg" ? "JPG" : ext.toUpperCase(), glyph: "image" };
  return { label: ext ? ext.toUpperCase() : "FILE", glyph: "text" };
}

/**
 * How many tiles a photo grid shows before its "+N" tile (uploads 2.5):
 * `rows` rows of `cols`, counted as they fall. A labeled run ("At finish",
 * then "Other photos") starts a new row, so `starts` are the indexes of the
 * runs' first tiles; a short first run leaves its row short instead of
 * letting the second row's tiles slide up under the first label.
 */
export function visibleTiles(total: number, cols: number, rows: number, starts: readonly number[] = []): number {
  const breaks = new Set(starts.filter((i) => i > 0));
  let row = 0;
  let col = 0;
  let shown = 0;
  for (let i = 0; i < total; i++) {
    if (col > 0 && breaks.has(i)) {
      row++;
      col = 0;
    }
    if (row >= rows) break;
    shown++;
    col++;
    if (col === cols) {
      row++;
      col = 0;
    }
  }
  return shown;
}
