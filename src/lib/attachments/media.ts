import { isOfflineError } from "@/lib/action-result";
import { FILE_KINDS, UPLOAD_RULES, contentTypeForName, fileKindForType, uploadContentType, type FileKind } from "./content-types";

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
 */
export function uploadNotice(failures: UploadFailure[]): string {
  if (failures.length === 0) return "";
  if (failures.some((f) => NO_BLOB_STORE.test(f.reason))) return "File uploads aren't set up yet.";
  const kinds = failures.map((f) => f.kind ?? fileKindForType(contentTypeForName(f.name)));
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  const count = `${failures.length} ${noun}${failures.length === 1 ? "" : "s"} didn't upload`;
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
