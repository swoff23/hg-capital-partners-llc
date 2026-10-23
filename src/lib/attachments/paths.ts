import { filenameForType } from "./content-types";

/**
 * Where task files live in Blob, and which blob URLs are ours. Blob can't
 * assign a path to an upload, only refuse one, so the token route checks the
 * path the browser asks for and the record step checks the path head()
 * reports. Pure; see paths.test.ts.
 *
 *   tasks/<taskId>/orig/<name>     the file as uploaded
 *   tasks/<taskId>/thumb/<name>    a ~1024px JPEG for grids
 *   tasks/<taskId>/poster/<name>   a frame of a video
 */

export const UPLOAD_ROLES = ["orig", "thumb", "poster"] as const;
export type UploadRole = (typeof UPLOAD_ROLES)[number];

/** The name part a browser may ask for. */
const REQUESTED_NAME = /^[A-Za-z0-9._-]{1,100}$/;
/** The name part Blob stores: the same, plus room for "-<random>" before the extension. */
const STORED_NAME = /^[A-Za-z0-9._-]{1,160}$/;
/** cuid and friends. Anything with a slash or a dot could step outside the task's folder. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME = 100;

function roleIn(pathname: string, taskId: string, name: RegExp): UploadRole | null {
  if (!SAFE_ID.test(taskId)) return null;
  const prefix = `tasks/${taskId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const [role, file, ...rest] = pathname.slice(prefix.length).split("/");
  if (rest.length || !file || !(UPLOAD_ROLES as readonly string[]).includes(role)) return null;
  // "." and ".." match the character set but a URL parser would resolve them away.
  if (!name.test(file) || !/[A-Za-z0-9]/.test(file)) return null;
  return role as UploadRole;
}

/**
 * The role of a path a browser asks to upload to, or null when it's refused.
 * Exactly ^tasks/<taskId>/(orig|thumb|poster)/[A-Za-z0-9._-]{1,100}$.
 */
export function requestedUploadRole(pathname: string, taskId: string): UploadRole | null {
  return roleIn(pathname, taskId, REQUESTED_NAME);
}

/** The role of a stored blob's path (random suffix and all), or null when it isn't this task's. */
export function storedUploadRole(pathname: string, taskId: string): UploadRole | null {
  return roleIn(pathname, taskId, STORED_NAME);
}

/**
 * A file name squeezed into the path character set, keeping its extension:
 * "Kitchen (after) é.HEIC" → "Kitchen-after-e.heic". At most 100 characters.
 */
export function safeUploadName(filename: string): string {
  const trimmed = filename.trim();
  const m = /^(.*)\.([A-Za-z0-9]{1,10})$/.exec(trimmed);
  const ext = m ? m[2].toLowerCase() : "";
  const base =
    (m ? m[1] : trimmed)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "file";
  const room = MAX_NAME - (ext ? ext.length + 1 : 0);
  const cut = base.slice(0, room).replace(/[-.]+$/, "") || "file";
  return ext ? `${cut}.${ext}` : cut;
}

/**
 * The path the uploader asks for. Pass the type it will upload as, so the
 * name's extension agrees with it (the token route refuses one that doesn't).
 */
export function taskUploadPath(taskId: string, filename: string, role: UploadRole = "orig", contentType?: string): string {
  return `tasks/${taskId}/${role}/${safeUploadName(contentType ? filenameForType(filename, contentType) : filename)}`;
}

/** The store id inside a read-write token, "vercel_blob_rw_<storeId>_<secret>". */
export function storeIdFromToken(token: string | null | undefined): string | null {
  const parts = (token ?? "").split("_");
  if (parts.length < 5 || parts[0] !== "vercel" || parts[1] !== "blob" || parts[2] !== "rw") return null;
  return /^[A-Za-z0-9]+$/.test(parts[3]) ? parts[3] : null;
}

export function privateStoreHost(storeId: string): string {
  return `${storeId.toLowerCase()}.private.blob.vercel-storage.com`;
}

/**
 * True when the URL is a blob in our private store, and (when given) at that
 * exact pathname. A public-store URL, another store, or anything else is not.
 */
export function isPrivateStoreUrl(url: string | null | undefined, storeId: string | null, pathname?: string): boolean {
  if (!url || !storeId) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.hostname !== privateStoreHost(storeId) || u.port || u.username) return false;
  if (pathname === undefined) return true;
  try {
    return decodeURIComponent(u.pathname.slice(1)) === pathname;
  } catch {
    return false;
  }
}
