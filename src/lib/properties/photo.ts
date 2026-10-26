import "server-only";
import { revalidatePath } from "next/cache";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { storeIdFromToken } from "@/lib/attachments/paths";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * A property's photos in public Blob (docs/specs/uploads-photos.md 2.9 and
 * 2.10): the building's front photo, and the listing photos a sheet uploads
 * before Save. Services own writes, so every change to `Property.photoUrl`
 * and `photoPathname` goes through here, and so does checking what the
 * browser says it uploaded.
 *
 * Both are public, so the browser has prepared them (upright, a 2560px JPEG,
 * no metadata) before they go up. The server doesn't trust that or the
 * browser's size and type: it asks Blob's head() what is really there, and a
 * file that isn't an image of ours, or is over 25 MB, is deleted and refused.
 *
 * The photo columns are written on their own and leave `updatedAt` alone. That
 * timestamp is the version a units, CapEx or listing sheet pinned when it
 * opened (properties/service.ts), and a photo isn't a field in any of them: if
 * it moved the version, setting the front photo would refuse someone's open
 * Save with "Pieter changed this".
 */

const MB = 1024 * 1024;

/** What a public property photo may be. The browser sends a JPEG; the rest is for a file Blob kept as it was. */
const PHOTO_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const PHOTO_MAX_BYTES = 25 * MB;

/** The folder the front photo uploads to (lib/attachments/upload-kinds.ts uploadRequest). */
export function propertyPhotoFolder(propertyId: string): string {
  return `properties/${propertyId}/photo/`;
}

/** A property photo's pathname as Blob keeps it, with its random suffix, inside the property's photo folder and nowhere else. */
export function isPropertyPhotoPath(propertyId: string, pathname: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(propertyId)) return false;
  const prefix = propertyPhotoFolder(propertyId);
  if (!pathname.startsWith(prefix)) return false;
  const name = pathname.slice(prefix.length);
  return /^[A-Za-z0-9._-]{1,200}$/.test(name) && /[A-Za-z0-9]/.test(name);
}

/** A stored photo: where it is, and the pathname that deletes it. */
export type PhotoRef = { url: string; pathname: string };

type BlobAuth = { token: string; storeId: string };

function blobAuth(): BlobAuth {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new Error("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

/** True when the URL is a blob in our public store (https, our host, no port or login). */
function isPublicStoreUrl(url: string, storeId: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === `${storeId.toLowerCase()}.public.blob.vercel-storage.com` && !u.port && !u.username;
  } catch {
    return false;
  }
}

/** Blob's own words for the file at `pathname`, or null when nothing is there. */
async function headOf(pathname: string, auth: BlobAuth): Promise<HeadBlobResult | null> {
  try {
    return await head(pathname, { token: auth.token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

/** Best effort: a file already gone, or no token, isn't an error. */
async function deleteBlobs(targets: readonly string[], auth?: BlobAuth): Promise<void> {
  const token = auth?.token ?? getEnv().BLOB_READ_WRITE_TOKEN;
  if (!token || targets.length === 0) return;
  try {
    await del([...targets], { token });
  } catch (err) {
    logError("properties:photo:delete", err, { count: targets.length });
  }
}

/**
 * The public photo at `pathname`, checked against what Blob holds: our public
 * store, an image of an allowed type, under the cap. A file that fails is
 * deleted (an upload nobody can record is only clutter) and refused with a
 * line the uploader can show.
 */
async function verifiedPhoto(pathname: string, auth: BlobAuth): Promise<PhotoRef> {
  const blob = await headOf(pathname, auth);
  if (!blob) throw new Error("That upload didn't finish. Try again.");
  const refuse = async (why: string) => {
    if (blob.pathname === pathname && isPublicStoreUrl(blob.url, auth.storeId)) await deleteBlobs([blob.url], auth);
    throw new Error(why);
  };
  if (blob.pathname !== pathname || !isPublicStoreUrl(blob.url, auth.storeId)) return refuse("That photo isn't in our public storage.");
  const type = blob.contentType.split(";")[0].trim().toLowerCase();
  if (!PHOTO_TYPES.includes(type)) return refuse("That type of file can't be a photo.");
  if (blob.size > PHOTO_MAX_BYTES) return refuse("That photo is over the 25 MB limit.");
  return { url: blob.url, pathname: blob.pathname };
}

function revalidateProperty(propertyId: string): void {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/");
}

async function currentPhoto(propertyId: string): Promise<PhotoRef | null> {
  const row = await prisma.property.findUnique({ where: { id: propertyId }, select: { photoUrl: true, photoPathname: true } });
  if (!row) throw new Error("This property is gone.");
  return row.photoUrl && row.photoPathname ? { url: row.photoUrl, pathname: row.photoPathname } : null;
}

async function writePhoto(propertyId: string, photo: PhotoRef | null): Promise<void> {
  // On its own, so Property.updatedAt (the units, CapEx and listing sheets' version) stays where it is.
  await prisma.$executeRaw`UPDATE "Property" SET "photoUrl" = ${photo?.url ?? null}, "photoPathname" = ${photo?.pathname ?? null} WHERE "id" = ${propertyId}`;
}

/**
 * Sets the building's front photo to a file the browser just uploaded to
 * `properties/<id>/photo/`. Returns the photo it replaced, which stays in Blob
 * until the caller's Undo window passes (`discardPropertyPhoto`) or it is put
 * back (`restorePropertyPhoto`).
 */
export async function setPropertyPhoto(
  propertyId: string,
  pathname: string,
  spare: readonly string[] = [],
): Promise<{ previous: PhotoRef | null; current: PhotoRef }> {
  if (!isPropertyPhotoPath(propertyId, pathname)) throw new Error("That photo isn't in this property's folder.");
  const auth = blobAuth();
  const previous = await currentPhoto(propertyId);
  // The front photo keeps no thumbnail: whatever the browser made beside it goes.
  if (spare.length > 0) await discardListingUploads(propertyId, spare);
  const current = await verifiedPhoto(pathname, auth);
  await writePhoto(propertyId, current);
  revalidateProperty(propertyId);
  return { previous: previous && previous.pathname !== current.pathname ? previous : null, current };
}

/** Clears the front photo, returning what was there for the Undo window. */
export async function removePropertyPhoto(propertyId: string): Promise<{ previous: PhotoRef | null }> {
  const previous = await currentPhoto(propertyId);
  await writePhoto(propertyId, null);
  revalidateProperty(propertyId);
  return { previous };
}

/**
 * Puts a photo that was replaced or removed back (Undo). It must still be in
 * Blob; the stored URL is Blob's own, never the browser's. Returns the photo
 * it displaced, for the caller to discard.
 */
export async function restorePropertyPhoto(propertyId: string, pathname: string): Promise<{ displaced: PhotoRef | null; current: PhotoRef }> {
  if (!isPropertyPhotoPath(propertyId, pathname)) throw new Error("That photo isn't in this property's folder.");
  const auth = blobAuth();
  const blob = await headOf(pathname, auth);
  if (!blob || !isPublicStoreUrl(blob.url, auth.storeId)) throw new Error("That photo is gone, so it can't be put back.");
  const displaced = await currentPhoto(propertyId);
  const current = { url: blob.url, pathname: blob.pathname };
  await writePhoto(propertyId, current);
  revalidateProperty(propertyId);
  return { displaced: displaced && displaced.pathname !== current.pathname ? displaced : null, current };
}

/**
 * Deletes a front photo that was replaced, removed or undone once nobody can
 * ask for it back. Refuses the photo the property shows now, and any path
 * outside this property's photo folder.
 */
export async function discardPropertyPhoto(propertyId: string, pathname: string): Promise<void> {
  if (!isPropertyPhotoPath(propertyId, pathname)) return;
  const now = await currentPhoto(propertyId);
  if (now?.pathname === pathname) return;
  await deleteBlobs([pathname]);
}

/**
 * A listing photo the browser just uploaded: checked against Blob, and given
 * back with the URL the public site will use. The row is written at Save, with
 * the whole set (properties/service.ts saveListing).
 */
export async function recordListingPhoto(propertyId: string, pathname: string, spare: readonly string[] = []): Promise<PhotoRef> {
  const exists = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!exists) throw new Error("This property is gone.");
  const auth = blobAuth();
  // A listing keeps neither a thumbnail nor a poster: whatever the browser made beside it goes.
  if (spare.length > 0) await discardListingUploads(propertyId, spare);
  return verifiedPhoto(pathname, auth);
}

/**
 * Deletes listing photos a sheet uploaded and then dropped: Discard, Cancel,
 * X and Esc, and a photo removed before Save (G1D-026). Skips any file a
 * listing row or the front photo uses, so a stale list can't take a saved
 * photo with it, and any path that isn't in our public store.
 */
export async function discardListingUploads(propertyId: string, pathnames: readonly string[]): Promise<{ deleted: number }> {
  const unique = [...new Set(pathnames.filter((p) => typeof p === "string" && p.length > 0 && p.length <= 400))];
  if (unique.length === 0) return { deleted: 0 };
  const owner = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!owner) return { deleted: 0 };
  const auth = blobAuth();
  const [listed, shown] = await Promise.all([
    prisma.listingPhoto.findMany({ where: { pathname: { in: unique } }, select: { pathname: true } }),
    prisma.property.findMany({ where: { photoPathname: { in: unique } }, select: { photoPathname: true } }),
  ]);
  const used = new Set([...listed.map((l) => l.pathname), ...shown.map((s) => s.photoPathname)]);
  // Only blobs that really are in our public store: a pathname alone could name a private file.
  const found: string[] = [];
  for (const pathname of unique.filter((p) => !used.has(p))) {
    const blob = await headOf(pathname, auth);
    if (blob && blob.pathname === pathname && isPublicStoreUrl(blob.url, auth.storeId)) found.push(blob.url);
  }
  await deleteBlobs(found, auth);
  return { deleted: found.length };
}

/** A photo taken at a property, as the "Photos taken here" picker lists it. */
export type TakenHerePhoto = { id: string; filename: string; hasThumb: boolean; createdAt: Date; taskTitle: string };

/** The most photos the picker lists. */
const TAKEN_HERE_LIMIT = 60;

/**
 * Photos attached to this property's tasks, newest first (uploads 2.10): the
 * pool "Choose from photos taken here" draws on. Staff only; the files are
 * private, so the picker reads each through the task file route. `total` is
 * every photo there, `photos` the newest ones.
 */
export async function takenHerePhotos(propertyId: string): Promise<{ total: number; photos: TakenHerePhoto[] }> {
  const where = { kind: "IMAGE" as const, deletedAt: null, task: { propertyId } };
  const [total, rows] = await Promise.all([
    prisma.taskAttachment.count({ where }),
    prisma.taskAttachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKEN_HERE_LIMIT,
      select: { id: true, filename: true, thumbPathname: true, createdAt: true, task: { select: { title: true } } },
    }),
  ]);
  return {
    total,
    photos: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      hasThumb: !!r.thumbPathname,
      createdAt: r.createdAt,
      taskTitle: r.task.title,
    })),
  };
}
