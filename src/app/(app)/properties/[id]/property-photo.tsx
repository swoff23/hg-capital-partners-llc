"use client";
import { useEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Images, Trash2, Upload } from "lucide-react";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { isGoingUp, useMediaUploader, type RecordMediaInput, type RecordMediaResult } from "@/components/media-uploader";
import { PhotoThumb } from "@/components/photo-thumb";
import { Sheet } from "@/components/sheet";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import type { UploadTarget } from "@/components/upload-queue";
import { callAction } from "@/lib/action-result";
import { pickerAccept, taskFileUrl } from "@/lib/attachments/media";
import { shortAddress } from "@/lib/normalize";
import type { TakenHerePhoto } from "@/lib/properties/photo";
import {
  discardPropertyPhotoAction,
  removePropertyPhotoAction,
  restorePropertyPhotoAction,
  setPropertyPhotoAction,
  takenHerePhotosAction,
} from "./photo-actions";

/**
 * The building's front photo in the record header
 * (docs/specs/uploads-photos.md 2.10): full width at 16:9 on a phone, often
 * held at the building, and 96x72 beside the title from sm. The fallback
 * tile until a photo is set.
 *
 * For staff (`canEdit`) the tile is a button. With no photo it carries "Add
 * photo" under the House. A tap opens a menu: Upload photo, Choose from
 * photos taken here (only when tasks at this property have photos) and
 * Remove photo (once one is set); with one choice, the tap goes straight to
 * the file picker. A photo goes up as a `display` target (upright, a 2560px
 * JPEG, no metadata) to public Blob, and the property shows it from then on.
 * "Property photo set · Undo" puts the old one back for as long as the toast
 * is up, and the old file is deleted once nobody can ask for it. The
 * contractor portal never edits it.
 *
 * `usePropertyPhoto` is the same flow without the tile, for the viewer's
 * "Set as property photo" on a task photo (uploads 2.10, wired in phase 2).
 */

/** The old file stays this long after a change, a beat longer than the toast's five seconds. */
const KEEP_OLD_MS = 7_000;

type PhotoRef = { url: string; pathname: string };

/**
 * Deletes a replaced or removed photo once its Undo window has passed, unless
 * Undo took it back. A plain timer outside any component, so leaving the page
 * inside the window still cleans up; a reload inside it leaves the old file in
 * Blob, which nothing points at.
 */
function discardLater(propertyId: string, photo: PhotoRef | null, undone: { current: boolean }) {
  if (!photo) return;
  setTimeout(() => {
    if (!undone.current) void callAction(() => discardPropertyPhotoAction(propertyId, photo.pathname));
  }, KEEP_OLD_MS);
}

/**
 * Sets, removes and undoes the front photo, and uploads the file for it. The
 * file goes through the upload engine as a `display` target with one file;
 * what the target records is the property's photo.
 */
export function usePropertyPhoto({ propertyId, label }: { propertyId: string; label: string }) {
  const { toast } = useToast();

  /** Puts `photo` back (Undo), and deletes the one it displaces. */
  async function putBack(photo: PhotoRef, undone: { current: boolean }) {
    undone.current = true;
    const res = await callAction(() => restorePropertyPhotoAction(propertyId, photo.pathname));
    if (!res.ok) {
      toast({ message: res.error });
      return;
    }
    if (res.data.displaced) void callAction(() => discardPropertyPhotoAction(propertyId, res.data.displaced!.pathname));
  }

  /** The Undo of a first photo (nothing to put back): remove it, and delete the file. */
  async function takeAway(photo: PhotoRef, undone: { current: boolean }) {
    undone.current = true;
    const res = await callAction(() => removePropertyPhotoAction(propertyId));
    if (!res.ok) {
      toast({ message: res.error });
      return;
    }
    void callAction(() => discardPropertyPhotoAction(propertyId, photo.pathname));
  }

  /** The record step of the upload: the property shows the file from now on. */
  async function record(file: RecordMediaInput): Promise<RecordMediaResult> {
    const res = await callAction(() => setPropertyPhotoAction(propertyId, file));
    if (!res.ok) return { ok: false, error: res.error };
    const { previous, current } = res.data;
    const undone = { current: false };
    discardLater(propertyId, previous, undone);
    toast({
      message: "Property photo set",
      key: `property-photo:${propertyId}`,
      action: { label: "Undo", onAction: () => void (previous ? putBack(previous, undone) : takeAway(current, undone)) },
    });
    return { ok: true, data: { id: current.pathname } };
  }

  const target: UploadTarget = {
    key: `property-photo:${propertyId}`,
    label,
    uploadKind: "property-photo-upload",
    parentId: propertyId,
    access: "public",
    allowed: ["image"],
    maxFiles: 1,
    prepare: "display",
    record,
    whenAway: "hold",
  };
  const uploader = useMediaUploader({ target });
  const uploading = uploader.uploads.some(isGoingUp);

  // A photo that didn't go up says so with a way to try again; the file waits in the engine until then.
  const failed = uploader.failed;
  const seenFailed = useRef(0);
  useEffect(() => {
    if (failed > seenFailed.current) {
      const retryable = uploader.uploads.filter((u) => u.status === "failed");
      toast({
        // The count alone ("1 photo didn't upload"): the toast has Retry, and one line is all it holds.
        message: uploader.failedLine || "The photo didn't upload",
        key: `property-photo:${propertyId}:failed`,
        action: retryable.length > 0 ? { label: "Retry", onAction: () => retryable.forEach((u) => uploader.retry(u.key)) } : undefined,
      });
    }
    seenFailed.current = failed;
  }, [failed, propertyId, toast, uploader]);

  /** Starts the upload of one picked file. A failed one from before is cleared first, so nothing old waits behind it. */
  function upload(file: File) {
    for (const u of uploader.uploads) if (u.status === "failed" || u.status === "invalid") uploader.remove(u.key);
    uploader.addFiles([file]);
  }

  /** A photo taken at this property: fetched through the task file route and sent the way a picked file is. */
  async function fromTaskPhoto(attachment: { id: string; filename: string }) {
    try {
      const res = await fetch(taskFileUrl(attachment.id));
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      upload(new File([blob], attachment.filename, { type: blob.type }));
    } catch {
      toast({ message: "That photo wouldn't open. Try again." });
    }
  }

  async function remove() {
    const res = await callAction(() => removePropertyPhotoAction(propertyId));
    if (!res.ok) {
      toast({ message: res.error });
      return;
    }
    const { previous } = res.data;
    const undone = { current: false };
    discardLater(propertyId, previous, undone);
    toast({
      message: "Property photo removed",
      key: `property-photo:${propertyId}`,
      action: previous ? { label: "Undo", onAction: () => void putBack(previous, undone) } : undefined,
    });
  }

  return { uploading, upload, fromTaskPhoto, remove };
}

/**
 * The tile as staff see it. Kept apart from PropertyPhoto so a read-only
 * header (the portal never mounts this) carries none of the hooks.
 */
function EditablePhoto({ property }: { property: { id: string; address: string; photoUrl: string | null } }) {
  const place = shortAddress(property.address) || property.address;
  const alt = `Front of ${place}`;
  const photo = usePropertyPhoto({ propertyId: property.id, label: place });
  const fileRef = useRef<HTMLInputElement>(null);
  const [takenHere, setTakenHere] = useState<{ total: number; photos: TakenHerePhoto[] } | null>(null);
  const [choosing, setChoosing] = useState(false);

  // Whether tasks here have photos decides the menu, and a lone "Upload photo" skips the menu, so it is read once
  // when the page opens, before anyone taps.
  useEffect(() => {
    let live = true;
    void callAction(() => takenHerePhotosAction(property.id)).then((res) => {
      if (live && res.ok) setTakenHere(res.data);
    });
    return () => {
      live = false;
    };
  }, [property.id]);

  const hasPhoto = !!property.photoUrl;
  const canChoose = (takenHere?.total ?? 0) > 0;
  const name = `${hasPhoto ? "Change" : "Add"} front photo of ${place}`;

  const tile = (
    <>
      <PhotoThumb size="full" src={property.photoUrl} alt={alt} addLabel="Add photo" className="sm:hidden" />
      <PhotoThumb size={96} src={property.photoUrl} alt={alt} addLabel="Add photo" className="max-sm:hidden" />
      {photo.uploading && (
        // The old photo stays under a scrim until the new one is set; the tile says it's working.
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-photo-scrim/50 text-on-photo">
          <Spinner className="size-5" />
        </span>
      )}
    </>
  );
  const buttonClass = "relative block w-full rounded-lg disabled:cursor-default sm:w-auto";

  return (
    <div>
      {canChoose || hasPhoto ? (
        <MenuTrigger>
          <AriaButton aria-label={name} isDisabled={photo.uploading} className={buttonClass}>
            {tile}
          </AriaButton>
          <Menu sheetTitle="Front photo" placement="bottom start">
            <MenuItem icon={<Upload />} onAction={() => fileRef.current?.click()}>
              Upload photo
            </MenuItem>
            {canChoose && (
              <MenuItem icon={<Images />} onAction={() => setChoosing(true)}>
                Choose from photos taken here
              </MenuItem>
            )}
            {hasPhoto && (
              <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => void photo.remove()}>
                Remove photo
              </MenuItem>
            )}
          </Menu>
        </MenuTrigger>
      ) : (
        // One choice: the tap goes straight to the file picker.
        <button type="button" aria-label={name} disabled={photo.uploading} onClick={() => fileRef.current?.click()} className={buttonClass}>
          {tile}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={pickerAccept(["image"])}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) photo.upload(file);
        }}
      />

      <Sheet isOpen={choosing} onOpenChange={setChoosing} title={`Photos taken at ${place}`} size="lg">
        <TakenHerePicker
          photos={takenHere?.photos ?? []}
          onPick={(p) => {
            setChoosing(false);
            void photo.fromTaskPhoto(p);
          }}
        />
      </Sheet>
    </div>
  );
}

/** The photos taken at the building, newest first; a tap makes one the front photo. */
function TakenHerePicker({ photos, onPick }: { photos: TakenHerePhoto[]; onPick: (photo: TakenHerePhoto) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-2 p-4 md:grid-cols-4">
      {photos.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick(p)}
            aria-label={`Use ${p.filename} from ${p.taskTitle}`}
            className="relative block aspect-square w-full overflow-hidden rounded-lg bg-fill-1"
          >
            {/* Gated, session-checked route; next/image would cache it publicly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={taskFileUrl(p.id, p.hasThumb ? "thumb" : undefined)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg inset-shadow-photo-edge" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PropertyPhoto({
  property,
  canEdit = false,
}: {
  property: { id: string; address: string; photoUrl: string | null };
  canEdit?: boolean;
}) {
  if (canEdit) return <EditablePhoto property={property} />;
  const place = shortAddress(property.address) || property.address;
  const alt = `Front of ${place}`;
  return (
    <>
      <PhotoThumb size="full" src={property.photoUrl} alt={alt} className="sm:hidden" />
      <PhotoThumb size={96} src={property.photoUrl} alt={alt} className="max-sm:hidden" />
    </>
  );
}
