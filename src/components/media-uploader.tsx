"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Camera, FileImage, FileSpreadsheet, FileText, ImagePlus, Play, RotateCcw, TriangleAlert, WifiOff, X } from "lucide-react";
import { RetryPill } from "@/components/photo-thumb";
import { useToast } from "@/components/toast";
import { browserDeps, useUploadEngine, type UploadTarget } from "@/components/upload-queue";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useLeaveWarning } from "@/components/use-leave-warning";
import { type FileKind } from "@/lib/attachments/content-types";
import { NO_UPLOADS, UploadEngine } from "@/lib/attachments/engine";
import { CAMERA_ACCEPT, documentLook, pickerAccept, shownReason, uploadCountPhrase, uploadNotice } from "@/lib/attachments/media";
import { UPLOAD_KIND_ACCESS, uploadTargetKey, type UploadKind } from "@/lib/attachments/upload-kinds";
import { cn } from "@/lib/utils";

export type { UploadKind } from "@/lib/attachments/upload-kinds";
export { useLeaveWarning } from "@/components/use-leave-warning";

/**
 * Photo-and-video-first uploads for a task, a property or a listing: the staff
 * composer, the contractor job page, property Documents and the listing and
 * property photos (docs/specs/uploads-photos.md 2.1 and 2.3). The files
 * themselves go through the shared queue (upload-queue.tsx, engine.ts); this
 * hook is one surface's view of it: its tiles and counts, the camera and
 * file pickers, and Retry and Remove.
 *
 * Each file is checked here first (type and size, one-line reasons), given a
 * dated name when the camera's is generic, prepared (a thumbnail, a video
 * poster, for a "display" target a 2560px JPEG with no metadata), then goes
 * straight to Vercel Blob, three at a time, multipart above 8 MB, with
 * progress. `record` writes the row (the server re-checks the blob with
 * head()). Files keep going when the page that picked them is gone, and wait,
 * rather than fail, with no signal. Failed files keep a Retry; any file can
 * be removed.
 *
 *   const uploader = useMediaUploader({ target });
 *   {uploader.inputs}
 *   <MediaUploadTray uploader={uploader} />
 *
 * The older options (a task id and an upload kind) still work and name the
 * target themselves. `pending` counts files not yet recorded and sending:
 * hold "Mark done" until it's 0; `waiting` are the ones held for a signal,
 * and `failed` counts the red tiles still waiting for a Retry or a Remove.
 * Under a UploadQueueProvider everything outlives the page; without one
 * (a page outside both layouts) it is the same engine for the page alone.
 */

export type RecordMediaInput = {
  pathname: string;
  filename: string;
  width?: number;
  height?: number;
  durationSec?: number;
  /** The ~1024px JPEG made before upload (uploads 2.1), for grids and ready tiles. Both record actions take it. */
  thumbPathname?: string;
  /** A video's poster frame, made before upload. */
  posterPathname?: string;
  /** When the file joined the queue (ISO), for the late-upload rule after Mark done (question 4). Sent only when the target sets `sendQueuedAt`, since the record actions parse their input strictly. */
  queuedAt?: string;
};

export type RecordMediaResult = { ok: boolean; data?: { id: string }; error?: string };

export type MediaUploaderOptions = {
  taskId: string;
  uploadKind: UploadKind;
  record: (file: RecordMediaInput) => Promise<RecordMediaResult>;
  onRecorded?: (ids: string[]) => void;
  /** Called whenever the number of unfinished uploads changes. */
  onPendingChange?: (pending: number) => void;
  /** Kinds accepted; photos and videos unless widened. */
  allowed?: readonly FileKind[];
};

/** The same uploader for one queue target: the target names the kind, the row, what it accepts and how it records. */
export type MediaUploaderTargetOptions = {
  target: UploadTarget;
  /** Called whenever the number of unfinished uploads changes. */
  onPendingChange?: (pending: number) => void;
};

/** The target the older options describe. A contractor's photos are "display" photos (question 3); the rest go as picked. */
function targetFrom(o: MediaUploaderOptions): UploadTarget {
  const contractor = o.uploadKind === "portal-task-upload";
  return {
    key: uploadTargetKey(o.uploadKind, o.taskId),
    label: "",
    uploadKind: o.uploadKind,
    parentId: o.taskId,
    access: UPLOAD_KIND_ACCESS[o.uploadKind],
    allowed: o.allowed ?? ["image", "video"],
    prepare: contractor ? "display" : "original",
    record: o.record,
    onRecorded: o.onRecorded,
    whenAway: contractor ? "post" : "hold",
  };
}

type UploadStatus = "queued" | "uploading" | "saving" | "waiting" | "failed" | "invalid";

export type MediaUpload = {
  key: string;
  name: string;
  kind: FileKind | null;
  /** An object URL for the thumbnail, or null when there's nothing to show. */
  previewUrl: string | null;
  /** 0 to 1. */
  progress: number;
  status: UploadStatus;
  /** Why it failed, as the server or the check said it. */
  error?: string;
  /** The files picked, dropped or pasted together share one. */
  batchId?: string;
  /** Bytes. */
  size?: number;
};

export type MediaUploaderApi = {
  uploads: readonly MediaUpload[];
  /** Files not yet recorded and on their way (queued, uploading or saving). Files held for a signal are `waiting`. */
  pending: number;
  /** Files held for a signal: they retry on their own, on coming back online and after 2, 5, 15 and 60 seconds. */
  waiting: number;
  /** Red tiles: files that didn't go up (failed, or refused by the check) and are still waiting for a Retry or a Remove. */
  failed: number;
  /** One line about what failed, or "". */
  notice: string;
  /** The notice's count alone ("2 photos didn't upload"), for a line with its own Retry; each tile's label keeps the reason. */
  failedLine: string;
  /** Opens the camera on a phone ("Take photo or video"). */
  takePhoto: () => void;
  /** Opens the file picker, several at once ("Choose files"). */
  chooseFiles: () => void;
  /** For drops and pastes. */
  addFiles: (files: FileList | File[]) => void;
  retry: (key: string) => void;
  remove: (key: string) => void;
  /** The two hidden file inputs. Render once. */
  inputs: ReactNode;
};

/** Not recorded yet and on its way: waiting its turn, going up, or being saved. What `pending` counts. */
export function isGoingUp(u: MediaUpload): boolean {
  return u.status === "queued" || u.status === "uploading" || u.status === "saving";
}

export function useMediaUploader(input: MediaUploaderOptions | MediaUploaderTargetOptions): MediaUploaderApi {
  const target = "target" in input ? input.target : targetFrom(input);
  const shared = useUploadEngine();
  // Outside both layouts there is no shared queue: the page gets one of its own, with no outbox.
  const [own] = useState(() => (shared ? null : new UploadEngine(browserDeps({ notify: () => {}, navigate: () => {}, persist: false }))));
  const engine = shared ?? own!;
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  // The queue holds the latest record step and rules, so a file that lands after this render uses them.
  useEffect(() => {
    engine.setTarget(target);
  });
  // The page is here. Its files keep going when it isn't, and a batch that lands then is "away".
  useEffect(() => engine.mount(target.key), [engine, target.key]);

  const uploads = useSyncExternalStore(
    engine.subscribe,
    () => engine.uploadsFor(target.key),
    () => NO_UPLOADS,
  );

  const pending = uploads.filter(isGoingUp).length;
  const waiting = uploads.filter((u) => u.status === "waiting").length;
  const failed = uploads.filter((u) => u.status === "failed" || u.status === "invalid").length;
  // Told when the count changes, not on every render of a caller that passes a new function each time.
  const pendingChanged = useRef(input.onPendingChange);
  useEffect(() => {
    pendingChanged.current = input.onPendingChange;
  });
  useEffect(() => {
    pendingChanged.current?.(pending);
  }, [pending]);

  // Without a shared queue (or an outbox) a reload loses what's going up, so the browser asks first.
  useLeaveWarning(!shared && pending + waiting > 0);

  const failures = uploads.filter((u) => u.error).map((u) => ({ name: u.name, kind: u.kind, reason: u.error! }));
  const notice = uploadNotice(failures);
  const failedLine = uploadNotice(failures, { reason: false });

  const addFiles = (files: FileList | File[]) => engine.add(target, files);
  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };
  const inputs = (
    <>
      <input ref={cameraRef} type="file" accept={CAMERA_ACCEPT} capture="environment" hidden onChange={onPicked} />
      <input ref={filesRef} type="file" accept={pickerAccept(target.allowed)} multiple hidden onChange={onPicked} />
    </>
  );

  return {
    uploads,
    pending,
    waiting,
    failed,
    notice,
    failedLine,
    takePhoto: () => cameraRef.current?.click(),
    chooseFiles: () => filesRef.current?.click(),
    addFiles,
    retry: (key) => engine.retry(key),
    remove: (key) => engine.remove(key),
    inputs,
  };
}

/** How long a removal can be taken back, the toast's own five seconds. */
const UNDO_MS = 5000;

/**
 * Taking a ready file out of a reply with an Undo (uploads 2.3): the tile
 * goes at once, the toast reads "Photo removed · Undo", and the file itself is
 * deleted when the toast ends, not before. `restore` brings the tile back;
 * `remove` deletes the file. The delete runs even if the page is gone by
 * then; a reload inside the five seconds leaves the file as a draft.
 *
 *   const undoable = useUndoableRemove();
 *   undoable({ message: "Photo removed", hide: () => forget([r.id]), show: () => unforget([r.id]), remove: () => deleteTaskFile(r.id) });
 */
export function useUndoableRemove() {
  const { toast } = useToast();
  return useCallback(
    (input: { message: string; key?: string; hide: () => void; show: () => void; remove: () => void | Promise<unknown> }) => {
      let state: "waiting" | "undone" | "removed" = "waiting";
      const timer = setTimeout(() => {
        if (state !== "waiting") return;
        state = "removed";
        void input.remove();
      }, UNDO_MS + 300);
      input.hide();
      toast({
        message: input.message,
        key: input.key,
        action: {
          label: "Undo",
          onAction: () => {
            if (state !== "waiting") return;
            state = "undone";
            clearTimeout(timer);
            input.show();
          },
        },
      });
    },
    [toast],
  );
}

/**
 * The thumbnails of files in flight, with progress, Retry and Remove, and one
 * line about failures. `layout="row"` is 56px tiles in a wrapping row (the
 * staff composer). `layout="grid"` is square tiles at least 88px wide in a
 * fluid grid, where a failed photo keeps its picture inside the danger ring
 * with PhotoThumb's RetryPill near its bottom (docs/brand-guidelines.md,
 * section 9 Photos), and Remove sits inside the tile's corner.
 * `notice={false}` leaves the red line to the caller, for a screen that
 * shows it under its own button (the contractor's Mark done, from
 * `failedLine`, through UploadStatusLine).
 *
 * `slots` is the Mark done sheet's proof slots (uploads 2.8): in a grid, the
 * count of finished-work photos the playbook asks for (one on an optional
 * job). Slots not yet holding a photo are empty `--fill-1` squares with a
 * Camera (solid, never dashed) after the tiles in flight; `filled` is how
 * many the caller already shows as recorded (UploadTile `ready`) before the
 * tray, so they count. A tap opens `onSlot`, by default the camera on touch
 * and the file picker with a mouse (`capture` means nothing there). Once the
 * count is met, one add tile remains.
 *
 * `onFill` is for a tray on a `--fill-1` ground (an Internal note): the
 * Remove badge's ring takes that ground instead of `--surface`.
 */
export function MediaUploadTray({
  uploader,
  layout = "row",
  notice: showNotice = true,
  slots,
  filled = 0,
  onSlot,
  onFill = false,
  className,
}: {
  uploader: MediaUploaderApi;
  layout?: "row" | "grid";
  notice?: boolean;
  slots?: number;
  filled?: number;
  onSlot?: () => void;
  onFill?: boolean;
  className?: string;
}) {
  const { uploads, notice, retry, remove } = uploader;
  const coarse = useCoarsePointer();
  const grid = layout === "grid";
  const slotted = grid && slots !== undefined;
  if (uploads.length === 0 && !slotted) return null;
  const empty = slotted ? Math.max(0, slots - filled - uploads.filter((u) => u.status !== "invalid").length) : 0;
  const open = onSlot ?? (coarse ? uploader.takePhoto : uploader.chooseFiles);
  return (
    <div className={cn("space-y-1.5", className)}>
      <ul className={grid ? "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2" : "flex flex-wrap gap-2"}>
        {uploads.map((u) => (
          <UploadTile key={u.key} upload={u} grid={grid} onFill={onFill} onRetry={() => retry(u.key)} onRemove={() => remove(u.key)} />
        ))}
        {slotted &&
          Array.from({ length: empty }, (_, i) => (
            <li key={`slot-${i}`}>
              <button
                type="button"
                onClick={open}
                aria-label="Add a photo"
                className="relative flex aspect-square w-full items-center justify-center rounded-lg bg-fill-1 text-fg-3 inset-shadow-photo-edge transition-colors hover:text-fg-2"
              >
                <Camera className="size-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        {slotted && empty === 0 && (
          <li>
            <button
              type="button"
              onClick={uploader.chooseFiles}
              aria-label="Add more photos"
              className="relative flex aspect-square w-full items-center justify-center rounded-lg bg-fill-1 text-fg-3 inset-shadow-photo-edge transition-colors hover:text-fg-2"
            >
              <ImagePlus className="size-5" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
      {showNotice && notice && <p className="truncate text-meta text-danger">{notice}</p>}
    </div>
  );
}

/** What the tile says it is, ending its accessible name. */
function stateLabel(u: MediaUpload, ready: boolean): string {
  if (ready) return "ready to send";
  switch (u.status) {
    case "invalid":
    case "failed":
      return `couldn't upload: ${shownReason(u.error ?? "")}`;
    case "saving":
      return "saving";
    case "waiting":
      return "waiting for signal";
    case "queued":
      return "waiting";
    default:
      return `uploading, ${Math.round(u.progress * 100)}%`;
  }
}

/**
 * One file on the tray: its preview, the ring while it goes up, the danger
 * ring with Retry when it didn't, and Remove (uploads 2.3). A document shows
 * its type (a glyph over "PDF"), a photo the browser can't draw shows a HEIC
 * tile instead of a broken picture, and a file waiting for a signal sits
 * under the scrim with a WifiOff mark and no ring. `ready` is a file already
 * recorded and waiting to be sent (the composer's ready tiles): no ring, and
 * its name ends "ready to send".
 */
export function UploadTile({
  upload: u,
  grid,
  ready = false,
  onFill = false,
  onRetry,
  onRemove,
}: {
  upload: MediaUpload;
  grid: boolean;
  ready?: boolean;
  /** On a `--fill-1` ground: Remove's ring is that ground. */
  onFill?: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const [broken, setBroken] = useState(false);
  // A server-rendered preview (a ready tile) can fail before hydration attaches onError; this reads one that has settled.
  const settled = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  const failed = u.status === "failed" || u.status === "invalid";
  const label = stateLabel(u, ready);
  const photo = u.kind === "image" && !!u.previewUrl && !broken;
  const video = u.kind === "video" && !!u.previewUrl && !broken;
  // A document, or a photo with nothing to draw: its type over a glyph.
  const typed = !photo && !video && u.kind !== "video" ? documentLook(u.name) : null;
  const Glyph = typed?.glyph === "sheet" ? FileSpreadsheet : typed?.glyph === "image" ? FileImage : FileText;

  return (
    <li
      aria-label={`${u.name}, ${label}`}
      className={cn("relative rounded-lg bg-fill-1", grid ? "aspect-square w-full" : "h-14 w-14 shrink-0")}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {photo && (
          // An object URL of the picked file or its thumbnail: next/image can't optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={settled} src={u.previewUrl!} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {video && (
          <video src={`${u.previewUrl}#t=0.1`} muted playsInline preload="metadata" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {typed && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-fg-3">
            <Glyph className="size-5" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-micro">{typed.label}</span>
          </span>
        )}
        {u.kind === "video" && (
          <Play className="absolute bottom-1 left-1 h-3 w-3 fill-on-photo text-on-photo drop-shadow" aria-hidden="true" />
        )}
        {!ready && u.status === "waiting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-photo-scrim/50">
            <WifiOff className="size-5 text-on-photo" aria-hidden="true" />
          </div>
        )}
        {!ready && !failed && u.status !== "waiting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-photo-scrim/50">
            <ProgressRing value={u.status === "queued" ? 0 : u.progress} />
          </div>
        )}
        {u.status === "invalid" && (
          <div className="absolute inset-0 flex items-center justify-center bg-photo-scrim/60">
            <TriangleAlert className="h-5 w-5 text-on-photo" aria-hidden="true" />
          </div>
        )}
        {/* The edge sits over the preview, so a failed tile's red ring shows on a photo too. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-lg",
            failed ? "ring-2 ring-inset ring-danger" : "inset-shadow-photo-edge",
          )}
        />
      </div>
      {u.status === "failed" &&
        (grid ? (
          <RetryPill onClick={onRetry} label={`Retry ${u.name}`} />
        ) : (
          <button
            type="button"
            onClick={onRetry}
            aria-label={`Retry ${u.name}`}
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-photo-scrim/60 text-on-photo"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        ))}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${u.name}`}
        className={cn(
          // A square 20px badge: an icon-only button is square, never round. Its 1px ring is the tile's ground, so it
          // doesn't show a pale halo on an Internal note.
          "absolute flex h-5 w-5 items-center justify-center rounded-sm bg-act text-on-act ring-1",
          onFill ? "ring-fill-1" : "ring-surface",
          // On the corner of a 56px tile. A grid tile runs to the tray's edge, so its X sits inside: the 44px
          // touch area then reaches 8px out, short of Send in the gap beside it and of the Retry pill on the
          // tile above (gap 8px; the pill's area stops 2px above its tile's bottom).
          grid ? "right-1 top-1" : "-right-1.5 -top-1.5",
          // 44px with a finger, 32px with a mouse.
          "after:absolute after:-inset-3 pointer-fine:after:-inset-1.5",
        )}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Under the tray or a bar's buttons while any file didn't upload
 * (docs/brand-guidelines.md, section 9 Photos; uploads 2.3): "2 photos didn't
 * upload · Retry", Retry going for every tile that can go again. Each tile's
 * label keeps its reason. A file the check refused (too big, wrong type) can
 * only be removed, so it gets no Retry; with nothing to retry, the line keeps
 * the reason ("1 photo didn't upload: over the 25 MB photo limit"), since
 * it's the only place a sighted user sees why. With nothing failed but files
 * held for a signal it is "No signal · 5 photos waiting" in `--fg-3` ("No
 * signal · 5 waiting" under 360px). Nothing while all is well.
 */
export function UploadStatusLine({ uploader, className }: { uploader: MediaUploaderApi; className?: string }) {
  if (uploader.failed === 0) {
    if (uploader.waiting === 0) return null;
    const held = uploader.uploads.filter((u) => u.status === "waiting");
    return (
      <p className={cn("flex min-w-0 items-center justify-center gap-1 text-meta text-fg-3", className)}>
        <span className="truncate max-[359px]:hidden">No signal · {uploadCountPhrase(held.map((u) => u.kind))} waiting</span>
        <span className="truncate min-[360px]:hidden">No signal · {held.length} waiting</span>
      </p>
    );
  }
  const retryable = uploader.uploads.filter((u) => u.status === "failed");
  const line =
    (retryable.length > 0 ? uploader.failedLine : uploader.notice) ||
    `${uploader.failed} ${uploader.failed === 1 ? "file" : "files"} didn't upload`;
  return (
    <p className={cn("flex min-w-0 items-center justify-center gap-1 text-meta text-danger", className)}>
      <span className="truncate">{line}</span>
      {retryable.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => retryable.forEach((u) => uploader.retry(u.key))}
            className="relative shrink-0 font-medium underline decoration-1 underline-offset-3 hover:decoration-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
          >
            Retry
          </button>
        </>
      )}
    </p>
  );
}

/** A 24px ring that fills clockwise. The tile's label carries the percentage. */
function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-on-photo/30" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className="text-on-photo transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
      />
    </svg>
  );
}
