"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button as AriaButton, GridList, GridListItem, useDragAndDrop, type DropTarget } from "react-aria-components";
import { GripVertical, ImagePlus, MoreHorizontal, TriangleAlert, X } from "lucide-react";
import { Lightbox, type LightboxMenuItem, type MediaItem } from "@/components/lightbox";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import {
  ProgressRing,
  UploadStatusLine,
  isGoingUp,
  useMediaUploader,
  type MediaUpload,
  type RecordMediaInput,
  type RecordMediaResult,
} from "@/components/media-uploader";
import { PhotoThumb } from "@/components/photo-thumb";
import { useToast } from "@/components/toast";
import { DropLabel, useDropTarget, type UploadTarget } from "@/components/upload-queue";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { callAction } from "@/lib/action-result";
import { shownReason } from "@/lib/attachments/media";
import { cn } from "@/lib/utils";
import { discardListingUploadsAction, recordListingPhotoAction } from "./photo-actions";
import {
  LISTING_PHOTO_MAX,
  coverPhoto,
  movedAnnouncement,
  movedPhotoTo,
  photoName,
  photoRoom,
  photosNeededLine,
  restoredPhoto,
  withPhoto,
  withoutPhoto,
  type ListingPhotoDraft,
} from "./listing-photo-set";

export { LISTING_PHOTO_MAX, type ListingPhotoDraft } from "./listing-photo-set";

/**
 * Where each property's session uploads are kept: the public Blob files this
 * page uploaded for a listing since its sheet opened, by pathname, with the
 * URL the public site will use. A module-level map, so the sheet's Discard
 * can reach what ListingPhotos uploaded after ListingPhotos has unmounted.
 */
const sessionUploads = new Map<string, Map<string, string>>();

function noteSessionUpload(propertyId: string, photo: ListingPhotoDraft) {
  const session = sessionUploads.get(propertyId) ?? new Map<string, string>();
  session.set(photo.pathname, photo.url);
  sessionUploads.set(propertyId, session);
}

/**
 * Deletes the blobs ListingPhotos uploaded for this property since its sheet
 * opened, except those in `keep` (G1D-026). Discard, Cancel, X and Esc call
 * it with nothing kept; a Save that landed calls it with the photos it
 * stored, so a photo uploaded and then removed before Save goes too. The
 * server skips any file a listing or the front photo uses, so a stale list
 * can't take a saved photo with it. A failure to delete leaves the file in
 * Blob, where nothing points at it.
 */
export async function discardSessionUploads(propertyId: string, keep: readonly ListingPhotoDraft[] = []): Promise<void> {
  const session = sessionUploads.get(propertyId);
  if (!session) return;
  sessionUploads.delete(propertyId);
  const kept = new Set(keep.map((p) => p.pathname));
  const loose = [...session.keys()].filter((pathname) => !kept.has(pathname));
  if (loose.length === 0) return;
  await callAction(() => discardListingUploadsAction(propertyId, loose));
}

/** What a dragged tile carries: the photo's pathname. Our own type, so a file or a link dragged in is never accepted here. */
const PHOTO_DRAG_TYPE = "application/x-hg-listing-photo";

/**
 * A rental listing's public photos inside its sheet (docs/specs/
 * uploads-photos.md 2.9, choice 4 A): a big cover, drag to reorder, one ⋯
 * per photo, an Add tile, and drops. Controlled: `value` is the set, in
 * carousel order, and every change comes back through `onChange`; nothing is
 * saved until the sheet's Save. `onPendingChange` reports how many uploads
 * are still going, so Save can wait and say so ("2 photos uploading").
 *
 * Photos go up through the upload queue as a `display` target (upright, a
 * 2560px JPEG, no GPS), to public Blob. The first photo is the cover on the
 * site and spans 2 by 2 (the full width on a phone). A photo's ⋯ holds Make
 * cover, Move earlier, Move later, Open and Remove; Remove takes the tile
 * out with "Photo removed · Undo". The tiles are a React Aria GridList with
 * drag and drop: a mouse drags after a few pixels, a keyboard picks a tile up
 * from its drag handle (shown on focus) and drops it on another, and a touch
 * long press drags where the browser lets it, with Move earlier and Move
 * later in the ⋯ as the way that always works. A drop onto a tile puts the
 * dragged photo in that tile's place; onto the cover, it becomes the cover.
 *
 * The grid root has `display: contents`, so the in-flight tiles and the Add
 * tile sit in the same grid, last, with the photos.
 */
export function ListingPhotos({
  propertyId,
  name,
  value,
  onChange,
  max = LISTING_PHOTO_MAX,
  onPendingChange,
}: {
  propertyId: string;
  /** The listing's unit, for the photos' names: "Unit 2 photo 3". */
  name: string;
  value: readonly ListingPhotoDraft[];
  onChange: (photos: ListingPhotoDraft[]) => void;
  /** The most photos the listing holds. */
  max?: number;
  /** How many uploads are still going, whenever it changes: the sheet's Save waits on it and says so. */
  onPendingChange?: (pending: number) => void;
}) {
  const { toast } = useToast();
  const coarse = useCoarsePointer();
  const labelId = useId();

  // Uploads land one by one, before the sheet re-renders: each change starts from the latest set, not the one
  // this render saw, so two photos finishing together both stay.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const commit = (next: ListingPhotoDraft[]) => {
    latest.current = next;
    onChange(next);
  };
  const maxRef = useRef(max);
  useEffect(() => {
    maxRef.current = max;
  });

  // The live region: where a move landed, in words.
  const [announcement, setAnnouncement] = useState("");

  // ---- Uploading ----

  /** The record step: Blob's own URL for the file, once it checks out. Saved with the listing, at Save. */
  async function record(file: RecordMediaInput): Promise<RecordMediaResult> {
    const res = await callAction(() => recordListingPhotoAction(propertyId, file));
    if (!res.ok) return { ok: false, error: res.error };
    noteSessionUpload(propertyId, res.data);
    return { ok: true, data: { id: res.data.pathname } };
  }

  /** A batch landed: its photos join the set, last. Any that no longer fit (the cap) are deleted, not left in Blob. */
  function onRecorded(ids: string[]) {
    const urls = sessionUploads.get(propertyId);
    let next: ListingPhotoDraft[] = [...latest.current];
    const overflow: string[] = [];
    for (const pathname of ids) {
      const url = urls?.get(pathname);
      if (!url) continue;
      const grown = withPhoto(next, { url, pathname }, maxRef.current);
      if (grown.length === next.length && !next.some((p) => p.pathname === pathname)) overflow.push(pathname);
      next = grown;
    }
    if (next.length !== latest.current.length) commit(next);
    if (overflow.length > 0) void callAction(() => discardListingUploadsAction(propertyId, overflow));
  }

  const target: UploadTarget = {
    key: `listing:${propertyId}`,
    label: name,
    uploadKind: "listing-photo-upload",
    parentId: propertyId,
    access: "public",
    allowed: ["image"],
    maxFiles: photoRoom(value.length, max),
    prepare: "display",
    record,
    onRecorded,
    whenAway: "hold",
  };
  const uploader = useMediaUploader({ target, onPendingChange });

  // Closing the sheet takes its unfinished uploads with it: a photo that lands after Discard has nowhere to go.
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

  // Drops and pastes anywhere on the section, while the editor is open (uploads 2.2).
  const sectionRef = useRef<HTMLDivElement>(null);
  const drop = useDropTarget(value.length < max ? target : null, sectionRef, { label: "Drop to add photos" });

  // ---- Changing the set ----

  function remove(index: number) {
    const photo = latest.current[index];
    if (!photo) return;
    commit(withoutPhoto(latest.current, index));
    toast({
      message: "Photo removed",
      key: `listing-photo:${photo.pathname}`,
      action: { label: "Undo", onAction: () => commit(restoredPhoto(latest.current, photo, index, maxRef.current)) },
    });
  }

  /** The photo at `from` takes the place of the one at `to` (a drop, or one step earlier or later from the menu). */
  function move(from: number, to: number) {
    const next = movedPhotoTo(latest.current, from, to);
    if (next.every((p, i) => p.pathname === latest.current[i]?.pathname)) return;
    commit(next);
    setAnnouncement(movedAnnouncement(from, to));
  }

  function makeCover(index: number) {
    if (index <= 0) return;
    commit(coverPhoto(latest.current, index));
    setAnnouncement(movedAnnouncement(index, 0));
  }

  // ---- Drag and drop ----

  // The list itself (display: contents, so its own box is empty): the delegate below measures from it, as React Aria does.
  const listRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ [PHOTO_DRAG_TYPE]: String(k) })),
    acceptedDragTypes: [PHOTO_DRAG_TYPE],
    shouldAcceptItemDrop: (target) => target.dropPosition === "on",
    onDragStart: (e) => {
      dragging.current = [...e.keys][0] != null ? String([...e.keys][0]) : null;
    },
    onDragEnd: () => {
      dragging.current = null;
    },
    onItemDrop: async (e) => {
      // What the tile carried says which photo it was; the drag's own record is the fallback.
      const first = e.items[0];
      const carried = first && first.kind === "text" ? await first.getText(PHOTO_DRAG_TYPE).catch(() => null) : null;
      const set = latest.current;
      const from = set.findIndex((p) => p.pathname === (carried ?? dragging.current));
      const to = set.findIndex((p) => p.pathname === String(e.target.key));
      if (from >= 0 && to >= 0) move(from, to);
    },
    // The cover spans two rows, so the grid isn't in the reading order a list's own hit test assumes (its
    // lower half would resolve to the next tile). Whatever tile is under the pointer is the target.
    dropTargetDelegate: {
      getDropTargetFromPoint(x: number, y: number, isValid: (t: DropTarget) => boolean): DropTarget {
        const root = listRef.current;
        if (!root) return { type: "root" };
        const rect = root.getBoundingClientRect();
        const px = x + rect.left;
        const py = y + rect.top;
        for (const el of root.querySelectorAll<HTMLElement>("[role=row][data-key]")) {
          const r = el.getBoundingClientRect();
          if (px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
          const found: DropTarget = { type: "item", key: el.dataset.key!, dropPosition: "on" };
          if (isValid(found)) return found;
        }
        return { type: "root" };
      },
    },
  });

  // ---- The viewer ----

  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const [stamp] = useState(() => new Date());
  const urlByPath = new Map(value.map((p) => [p.pathname, p.url]));
  const viewerItems: MediaItem[] = value.map((p, i) => ({
    id: p.pathname,
    kind: "IMAGE",
    filename: photoName(name, i + 1),
    uploadedBy: null,
    createdAt: stamp,
  }));
  const viewerActions = (item: MediaItem): readonly LightboxMenuItem[] => {
    const i = latest.current.findIndex((p) => p.pathname === item.id);
    if (i < 0) return [];
    const actions: LightboxMenuItem[] = [];
    if (i > 0) actions.push({ id: "cover", label: "Make cover", onAction: () => makeCover(i) });
    if (i > 0) actions.push({ id: "earlier", label: "Move earlier", onAction: () => move(i, i - 1) });
    if (i < latest.current.length - 1) actions.push({ id: "later", label: "Move later", onAction: () => move(i, i + 1) });
    actions.push({ id: "remove", label: "Remove", destructive: true, onAction: () => remove(i) });
    return actions;
  };

  // ---- Drawing ----

  const count = value.length;
  const pending = uploader.uploads.length;
  const helper =
    photosNeededLine(count) ?? (coarse ? "The first photo is the cover on the site." : "The first photo is the cover on the site. Drag to reorder.");
  const full = count >= max;
  // A tile is the cover when it's first: it spans two columns (and two rows from md), and fills its cell.
  const coverCell = "col-span-2 md:row-span-2";

  return (
    <div ref={sectionRef} className="relative" role="group" aria-labelledby={labelId}>
      <div className="flex items-baseline justify-between gap-2">
        <span id={labelId} className="text-meta font-medium text-fg-2">
          Photos
        </span>
        <span className="text-meta tabular-nums text-fg-3">
          {count} of {max}
        </span>
      </div>
      <p className="mt-0.5 truncate text-meta text-fg-3">{helper}</p>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <GridList
          ref={listRef}
          aria-label={`${name} photos`}
          layout="grid"
          items={value.map((p) => ({ id: p.pathname, ...p }))}
          dragAndDropHooks={dragAndDropHooks}
          className="contents"
        >
          {(photo) => {
            const i = value.findIndex((p) => p.pathname === photo.id);
            const label = photoName(name, i + 1);
            return (
              <GridListItem
                id={photo.id}
                textValue={i === 0 ? `${label}, cover photo` : label}
                onAction={() => setViewer({ open: true, index: i })}
                className={({ isDragging, isFocusVisible }) =>
                  cn(
                    "group/tile relative min-w-0 select-none rounded-lg outline-none [-webkit-touch-callout:none]",
                    i === 0 && coverCell,
                    isDragging && "opacity-40",
                    isFocusVisible && "outline-2 outline-offset-2 outline-act",
                  )
                }
              >
                {({ isDropTarget }) => (
                  <>
                    <PhotoThumb
                      size="tile"
                      src={photo.url}
                      alt={label}
                      sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : undefined}
                      className={cn(i === 0 && "md:h-full")}
                    />
                    {isDropTarget && (
                      // The landing slot: the tile steps back under a --fill-1 wash and an inset --act edge.
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg bg-fill-1/80 ring-1 ring-inset ring-act" />
                    )}
                    {/* The keyboard's way to pick the tile up: shown only while it has focus. */}
                    <AriaButton
                      slot="drag"
                      className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-md bg-pill-bg text-pill-fg opacity-0 focus-visible:opacity-100"
                    >
                      <GripVertical className="size-4" aria-hidden="true" />
                    </AriaButton>
                    <TileMenu
                      label={label}
                      isCover={i === 0}
                      isLast={i === value.length - 1}
                      onCover={() => makeCover(i)}
                      onEarlier={() => move(i, i - 1)}
                      onLater={() => move(i, i + 1)}
                      onOpen={() => setViewer({ open: true, index: i })}
                      onRemove={() => remove(i)}
                    />
                  </>
                )}
              </GridListItem>
            );
          }}
        </GridList>

        {uploader.uploads.map((u) => (
          <PendingTile key={u.key} upload={u} onRetry={() => uploader.retry(u.key)} onRemove={() => uploader.remove(u.key)} first={count === 0 && u === uploader.uploads[0]} />
        ))}

        {!full && (
          <button
            type="button"
            onClick={uploader.chooseFiles}
            className={cn(
              "flex aspect-4/3 min-w-0 flex-col items-center justify-center gap-1 rounded-lg bg-fill-1 text-label text-fg-2 inset-shadow-photo-edge transition-colors not-disabled:hover:text-fg-1",
              count === 0 && pending === 0 && "col-span-2",
            )}
          >
            <ImagePlus aria-hidden="true" strokeWidth={1.5} className="size-5 text-fg-3" />
            Add photos
          </button>
        )}
      </div>

      <UploadStatusLine uploader={uploader} className="mt-2 justify-start" />
      {uploader.inputs}

      {/* The drop state: the field focus look 8px outside the content, so nothing shifts, and the label under the pointer. */}
      <DropLabel state={drop} label="Drop to add photos" />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Lightbox
        items={viewerItems}
        index={Math.min(viewer.index, Math.max(viewerItems.length - 1, 0))}
        onIndexChange={(index) => setViewer((v) => ({ ...v, index }))}
        isOpen={viewer.open && viewerItems.length > 0}
        onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}
        urlFor={(item) => urlByPath.get(item.id) ?? ""}
        header={{ title: name }}
        menuItems={viewerActions}
        canEdit
      />
    </div>
  );
}

/**
 * The one ⋯ on a photo (docs/specs/uploads-photos.md 2.9): 32px on the pill's
 * colors, 8px in from the top right, with a 44px hit area on touch, at rest at
 * every size. Make cover and the moves leave out what can't happen (the cover
 * can't be made the cover, or moved earlier).
 */
function TileMenu({
  label,
  isCover,
  isLast,
  onCover,
  onEarlier,
  onLater,
  onOpen,
  onRemove,
}: {
  label: string;
  isCover: boolean;
  isLast: boolean;
  onCover: () => void;
  onEarlier: () => void;
  onLater: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`${label} actions`}
        className={cn(
          "absolute right-2 top-2 flex size-8 items-center justify-center rounded-md bg-pill-bg text-pill-fg",
          // A 44px hit area around the 32px button on touch.
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
        )}
      >
        <MoreHorizontal aria-hidden="true" className="size-4 pointer-coarse:size-5" />
      </AriaButton>
      <Menu>
        {!isCover && <MenuItem onAction={onCover}>Make cover</MenuItem>}
        {!isCover && <MenuItem onAction={onEarlier}>Move earlier</MenuItem>}
        {!isLast && <MenuItem onAction={onLater}>Move later</MenuItem>}
        <MenuItem onAction={onOpen}>Open</MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive" onAction={onRemove}>
          Remove
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

/**
 * A photo still going up, failed or refused (uploads 2.3), at the grid's 4:3:
 * its local preview under the ring, a failed one inside the --danger ring with
 * the Retry pill, and Remove on all of them. The first of an empty set takes
 * the cover's size, so the tile that lands there doesn't jump.
 */
function PendingTile({ upload: u, onRetry, onRemove, first }: { upload: MediaUpload; onRetry: () => void; onRemove: () => void; first: boolean }) {
  const failed = u.status === "failed";
  const refused = u.status === "invalid";
  const state = refused
    ? `couldn't upload: ${shownReason(u.error ?? "")}`
    : failed
      ? `couldn't upload: ${shownReason(u.error ?? "")}`
      : u.status === "saving"
        ? "saving"
        : u.status === "queued"
          ? "waiting"
          : `uploading, ${Math.round(u.progress * 100)}%`;
  return (
    <div role="group" aria-label={`${u.name}, ${state}`} className={cn("relative min-w-0", first && "col-span-2 md:row-span-2")}>
      <PhotoThumb
        size="tile"
        src={u.previewUrl}
        unoptimized
        alt=""
        failed={failed || refused}
        onRetry={failed ? onRetry : undefined}
        className={cn(first && "md:h-full")}
      />
      {isGoingUp(u) && (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-photo-scrim/50">
          <ProgressRing value={u.status === "queued" ? 0 : u.progress} />
        </span>
      )}
      {refused && (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-photo-scrim/60">
          <TriangleAlert className="size-5 text-on-photo" aria-hidden="true" />
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${u.name}`}
        className={cn(
          "absolute right-2 top-2 flex size-5 items-center justify-center rounded-sm bg-act text-on-act ring-1 ring-raised",
          "after:absolute after:-inset-1.5 pointer-coarse:after:-inset-3",
        )}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
