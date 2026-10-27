"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import {
  discardListingUploads,
  discardPropertyPhoto,
  recordListingPhoto,
  removePropertyPhoto,
  restorePropertyPhoto,
  setPropertyPhoto,
  takenHerePhotos,
  type PhotoRef,
  type TakenHerePhoto,
} from "@/lib/properties/photo";
import { withResult } from "@/lib/server-action";

/**
 * The property photo's and the listing photos' actions (docs/specs/
 * uploads-photos.md 2.9 and 2.10): check who's calling, parse, and call the
 * photo service (src/lib/properties/photo.ts). The service checks the files
 * against Blob, not against what the browser says.
 */

const id = z.string().min(1).max(64);
const pathname = z.string().min(1).max(400);

// Where the browser put the file, never its URL, size or type: the service reads those from Blob itself.
// The rest is what the upload engine sends with any file (RecordMediaInput). The thumbnail and poster are made
// beside any photo; a public photo keeps neither, so the service deletes them.
const uploadedSchema = z
  .object({
    pathname,
    filename: z.string().max(255).optional(),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: pathname.nullish(),
    posterPathname: pathname.nullish(),
    queuedAt: z.string().max(40).nullish(),
  })
  .strict();

const spare = (u: z.infer<typeof uploadedSchema>) => [u.thumbPathname, u.posterPathname].filter((p): p is string => !!p);

/** The front photo set, and the one it replaced, which stays in Blob for the Undo window. */
export type PhotoSet = { previous: PhotoRef | null; current: PhotoRef };

/** After the browser uploaded the front photo to Blob: the property shows it from now on. */
export async function setPropertyPhotoAction(propertyId: string, file: z.input<typeof uploadedSchema>): Promise<ActionResult<PhotoSet>> {
  return withResult("setPropertyPhoto", async () => {
    await requireUser();
    const parsed = uploadedSchema.parse(file);
    return setPropertyPhoto(id.parse(propertyId), parsed.pathname, spare(parsed));
  });
}

/** Remove photo: the property goes back to the fallback tile. The old file stays for the Undo window. */
export async function removePropertyPhotoAction(propertyId: string): Promise<ActionResult<{ previous: PhotoRef | null }>> {
  return withResult("removePropertyPhoto", async () => {
    await requireUser();
    return removePropertyPhoto(id.parse(propertyId));
  });
}

/** Undo: the replaced or removed photo is the front photo again. */
export async function restorePropertyPhotoAction(
  propertyId: string,
  photoPathname: string,
): Promise<ActionResult<{ displaced: PhotoRef | null; current: PhotoRef }>> {
  return withResult("restorePropertyPhoto", async () => {
    await requireUser();
    return restorePropertyPhoto(id.parse(propertyId), pathname.parse(photoPathname));
  });
}

/** The Undo window passed: the file that was replaced or removed is deleted. Never the photo the property shows now. */
export async function discardPropertyPhotoAction(propertyId: string, photoPathname: string): Promise<ActionResult> {
  return withResult("discardPropertyPhoto", async () => {
    await requireUser();
    await discardPropertyPhoto(id.parse(propertyId), pathname.parse(photoPathname));
  });
}

/** After the browser uploaded a listing photo: Blob's own URL for it, once it checks out. Saved with the listing, at Save. */
export async function recordListingPhotoAction(propertyId: string, file: z.input<typeof uploadedSchema>): Promise<ActionResult<PhotoRef>> {
  return withResult("recordListingPhoto", async () => {
    await requireUser();
    const parsed = uploadedSchema.parse(file);
    return recordListingPhoto(id.parse(propertyId), parsed.pathname, spare(parsed));
  });
}

/** The listing sheet closed or saved: photos it uploaded and dropped are deleted (a saved photo never is). */
export async function discardListingUploadsAction(propertyId: string, pathnames: string[]): Promise<ActionResult<{ deleted: number }>> {
  return withResult("discardListingUploads", async () => {
    await requireUser();
    return discardListingUploads(id.parse(propertyId), z.array(pathname).max(60).parse(pathnames));
  });
}

/** Photos taken at the property, newest first, for "Choose from photos taken here". */
export async function takenHerePhotosAction(propertyId: string): Promise<ActionResult<{ total: number; photos: TakenHerePhoto[] }>> {
  return withResult("takenHerePhotos", async () => {
    await requireUser();
    return takenHerePhotos(id.parse(propertyId));
  });
}
