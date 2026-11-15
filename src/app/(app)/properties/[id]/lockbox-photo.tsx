"use client";
import { useEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Camera, Eye, ImageOff, Trash2, Upload } from "lucide-react";
import { isGoingUp, useMediaUploader, type RecordMediaInput, type RecordMediaResult } from "@/components/media-uploader";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import type { UploadTarget } from "@/components/upload-queue";
import { callAction } from "@/lib/action-result";
import type { LockboxPhoto } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { LockboxPhotoViewer, lockboxPhotoUrl } from "./lockbox-photo-viewer";
import { discardLockboxUploadsAction, recordLockboxPhotoAction } from "./photo-actions";

/**
 * A unit's lockbox photo (docs/specs/lockbox-location.md): the tile in the
 * unit sheet, and the viewer the Units list's "Photo" opens. Staff only; the
 * files are private and come through /api/files/property-lockbox, which
 * checks the path is in this property's lockbox folder.
 */

/**
 * The lockbox files this page uploaded since a unit sheet opened, by
 * property: an upload the sheet then dropped (Discard, Replace before Save)
 * is deleted when the sheet closes or saves. Module level, so the sheet's
 * close can reach what the tile uploaded after the tile has unmounted.
 */
const sessionUploads = new Map<string, Set<string>>();

function noteSessionUpload(propertyId: string, photo: LockboxPhoto) {
  const session = sessionUploads.get(propertyId) ?? new Set<string>();
  session.add(photo.pathname);
  if (photo.thumbPathname) session.add(photo.thumbPathname);
  sessionUploads.set(propertyId, session);
}

/**
 * Deletes the lockbox files the sheet uploaded and didn't keep: everything on
 * Discard, Cancel, X and Esc; everything but the saved photo after a Save.
 * The server skips any file a unit still uses, so a stale list can't take a
 * saved photo with it.
 */
export async function discardLockboxSession(propertyId: string, keep: LockboxPhoto | null = null): Promise<void> {
  const session = sessionUploads.get(propertyId);
  if (!session) return;
  sessionUploads.delete(propertyId);
  const kept = new Set([keep?.pathname, keep?.thumbPathname].filter(Boolean));
  const loose = [...session].filter((p) => !kept.has(p));
  if (loose.length > 0) await callAction(() => discardLockboxUploadsAction(propertyId, loose));
}

/**
 * The photo tile beside Code and Location in the unit sheet (decision 2): as
 * tall as the two fields (the parent stretches it), 96px wide. Empty, a
 * dashed "Add photo"; a tap opens the phone's camera or library. Set, the
 * photo, and a tap opens View, Replace photo and Remove photo. The file goes
 * up as a `display` photo (upright, a 2560px JPEG, no metadata, so no GPS)
 * to the private store as soon as it's picked; it's stored with the unit at
 * Save. `onPendingChange` lets Save wait while it's going up.
 */
export function LockboxPhotoField({
  propertyId,
  unitName,
  value,
  location,
  onChange,
  onPendingChange,
}: {
  propertyId: string;
  /** "Upper": for the uploader's toasts and the tile's name. */
  unitName: string;
  value: LockboxPhoto | null;
  location: string | null | undefined;
  onChange: (photo: LockboxPhoto | null) => void;
  onPendingChange?: (pending: number) => void;
}) {
  const { toast } = useToast();
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  /** The record step: the file checks out against Blob, and the sheet holds it until Save. */
  async function record(file: RecordMediaInput): Promise<RecordMediaResult> {
    const res = await callAction(() => recordLockboxPhotoAction(propertyId, file));
    if (!res.ok) return { ok: false, error: res.error };
    noteSessionUpload(propertyId, res.data);
    setBroken(false);
    changed.current(res.data);
    return { ok: true, data: { id: res.data.pathname } };
  }

  const target: UploadTarget = {
    key: `lockbox-photo:${propertyId}`,
    label: unitName,
    uploadKind: "lockbox-photo-upload",
    parentId: propertyId,
    access: "private",
    allowed: ["image"],
    maxFiles: 1,
    prepare: "display",
    record,
    whenAway: "hold",
  };
  const uploader = useMediaUploader({ target, onPendingChange });
  const going = uploader.uploads.find(isGoingUp);

  // Closing the sheet takes an unfinished upload with it: a photo that lands after Discard has nowhere to go.
  const uploaderRef = useRef(uploader);
  useEffect(() => {
    uploaderRef.current = uploader;
  });
  useEffect(
    () => () => {
      for (const u of uploaderRef.current.uploads) uploaderRef.current.remove(u.key);
    },
    [],
  );

  // A photo that didn't go up says so with a way to try again.
  const failed = uploader.failed;
  const seenFailed = useRef(0);
  useEffect(() => {
    if (failed > seenFailed.current) {
      const retryable = uploader.uploads.filter((u) => u.status === "failed");
      toast({
        message: uploader.failedLine || "The photo didn't upload",
        key: `lockbox-photo:${propertyId}:failed`,
        action: retryable.length > 0 ? { label: "Retry", onAction: () => retryable.forEach((u) => uploader.retry(u.key)) } : undefined,
      });
    }
    seenFailed.current = failed;
  }, [failed, propertyId, toast, uploader]);

  /** Picks a new file. A failed one from before is cleared first, so nothing old waits behind it. */
  function pick() {
    for (const u of uploader.uploads) if (u.status === "failed" || u.status === "invalid") uploader.remove(u.key);
    uploader.chooseFiles();
  }

  // Stretched by the sheet's row to the height of Code over Location, so its edges line up with theirs exactly.
  const tileClass = "relative flex min-h-24 w-24 shrink-0 self-stretch overflow-hidden rounded-md";
  const shown = going?.previewUrl ?? (value ? lockboxPhotoUrl(propertyId, value.thumbPathname || value.pathname) : null);

  const picture = shown && !(broken && !going) ? (
    // Gated, session-checked route (or the picked file's own preview); next/image would cache it publicly.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shown} alt="" decoding="async" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
      <ImageOff className="size-5" aria-hidden="true" />
    </span>
  );

  return (
    <>
      {uploader.inputs}
      {going ? (
        <div className={cn(tileClass, "bg-muted")} aria-busy="true" aria-label={`Lockbox photo for ${unitName} uploading`} role="img">
          {picture}
          <span className="absolute inset-0 flex items-center justify-center bg-photo-scrim/50 text-on-photo">
            <Spinner className="size-5" />
          </span>
        </div>
      ) : value ? (
        <MenuTrigger>
          <AriaButton aria-label={`Lockbox photo for ${unitName}`} className={cn(tileClass, "bg-muted outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring")}>
            {picture}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md inset-shadow-photo-edge" />
          </AriaButton>
          <Menu sheetTitle="Lockbox photo" placement="bottom start">
            <MenuItem icon={<Eye />} onAction={() => setViewing(true)}>
              View
            </MenuItem>
            <MenuItem icon={<Upload />} onAction={pick}>
              Replace photo
            </MenuItem>
            <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => onChange(null)}>
              Remove photo
            </MenuItem>
          </Menu>
        </MenuTrigger>
      ) : (
        <button
          type="button"
          onClick={pick}
          aria-label={`Add lockbox photo for ${unitName}`}
          className={cn(
            tileClass,
            "flex-col items-center justify-center gap-1 border border-dashed border-input text-meta text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:hover:border-line-strong pointer-fine:hover:text-foreground",
          )}
        >
          <Camera className="size-5" aria-hidden="true" />
          Add photo
        </button>
      )}
      {value && <LockboxPhotoViewer propertyId={propertyId} photo={value} location={location} isOpen={viewing} onOpenChange={setViewing} />}
    </>
  );
}
