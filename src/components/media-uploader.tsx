"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { upload } from "@vercel/blob/client";
import { Camera, ImagePlus, Play, RotateCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui";
import { isOfflineError } from "@/lib/action-result";
import { usesMultipart, type FileKind } from "@/lib/attachments/content-types";
import { CAMERA_ACCEPT, checkMediaFile, pickerAccept, shownReason, uploadFailureReason, uploadNotice } from "@/lib/attachments/media";
import { taskUploadPath } from "@/lib/attachments/paths";
import { cn } from "@/lib/utils";

/**
 * Photo-and-video-first uploads for a task: the staff composer and the
 * contractor job page (docs/asana-migration-plan.md §5.3). Documents too
 * where `allowed` includes "file" (the staff composer): "Choose files" offers
 * whatever `allowed` lets through.
 *
 * Each file is checked here first (type and size, one-line reasons), then
 * goes straight to private Vercel Blob at tasks/<taskId>/orig/<name>, three at
 * a time, multipart above 8 MB (usesMultipart), with progress. Only one
 * multipart file goes up at a time, since each holds its parts in memory;
 * photos keep the other slots. `record` writes the row (the server re-checks
 * the blob with head()); `onRecorded` gets the new ids each time the queue
 * drains. Failed files keep a Retry; any file can be removed.
 *
 *   <MediaUploader taskId={id} uploadKind="task-upload" record={recordAction} onRecorded={…}>
 *     {({ takePhoto, chooseFiles, pending }) => …your buttons…}
 *   </MediaUploader>
 *
 * When the buttons and the thumbnails live apart (a sticky bottom bar), use
 * useMediaUploader() with <MediaUploadTray> and render `inputs` once.
 * `pending` counts files not yet recorded: hold "Mark done" until it's 0.
 * `failed` counts the red tiles still waiting for a Retry or a Remove.
 */

export type UploadKind = "task-upload" | "portal-task-upload";

export type RecordMediaInput = {
  pathname: string;
  filename: string;
  width?: number;
  height?: number;
  durationSec?: number;
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

type UploadStatus = "queued" | "uploading" | "saving" | "failed" | "invalid";

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
};

export type MediaUploaderApi = {
  uploads: MediaUpload[];
  /** Files not yet recorded (queued, uploading or saving). */
  pending: number;
  /** Red tiles: files that didn't go up (failed, or refused by the check) and are still waiting for a Retry or a Remove. */
  failed: number;
  /** One line about what failed, or "". */
  notice: string;
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

/** Not recorded yet: waiting its turn, going up, or being saved. What `pending` counts. */
export function isGoingUp(u: MediaUpload): boolean {
  return u.status === "queued" || u.status === "uploading" || u.status === "saving";
}

const CONCURRENCY = 3;
const META_TIMEOUT_MS = 3000;

type MediaMeta = { width?: number; height?: number; durationSec?: number };

type Job = {
  file: File;
  contentType: string;
  fileKind: FileKind;
  controller: AbortController | null;
  meta?: MediaMeta;
  /** Set once the bytes are up. A retry after a failed record step records it again instead of re-sending a big video. */
  pathname?: string;
};

export function useMediaUploader(options: MediaUploaderOptions): MediaUploaderApi {
  const [uploads, setUploads] = useState<MediaUpload[]>([]);
  const jobs = useRef(new Map<string, Job>());
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  /** A multipart file is going up. @vercel/blob reads up to 96 MB of its parts into memory, so only one at a time. */
  const multipartActive = useRef(false);
  const recorded = useRef<string[]>([]);
  /** Preview object URLs by upload key, revoked when the tile goes. */
  const previews = useRef(new Map<string, string>());
  const seq = useRef(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  // Async uploads read the latest props, not the ones from when they started.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const patch = (key: string, p: Partial<MediaUpload>) => setUploads((us) => us.map((u) => (u.key === key ? { ...u, ...p } : u)));

  const drop = (key: string) => {
    const url = previews.current.get(key);
    if (url) URL.revokeObjectURL(url);
    previews.current.delete(key);
    setUploads((us) => us.filter((u) => u.key !== key));
  };

  async function run(key: string) {
    const job = jobs.current.get(key);
    if (!job) return;
    const controller = new AbortController();
    job.controller = controller;
    patch(key, { status: "uploading", progress: 0, error: undefined });
    try {
      job.meta ??= await readMediaMeta(job.file, job.fileKind);
      if (!jobs.current.has(key)) return; // removed before any bytes went up
      let pathname = job.pathname;
      if (!pathname) {
        const { taskId, uploadKind } = latest.current;
        const blob = await upload(taskUploadPath(taskId, job.file.name, "orig", job.contentType), job.file, {
          access: "private",
          handleUploadUrl: `/api/blob/${uploadKind}`,
          clientPayload: JSON.stringify({ taskId, fileKind: job.fileKind }),
          contentType: job.contentType,
          multipart: usesMultipart(job.file.size),
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) => patch(key, { progress: Math.min(1, percentage / 100) }),
        });
        pathname = blob.pathname;
      }
      if (!jobs.current.has(key)) return; // removed while the last bytes went up
      patch(key, { status: "saving", progress: 1 });
      // One record-only retry: a refusal may have discarded the blob, so after that it uploads again.
      job.pathname = job.pathname ? undefined : pathname;
      let res: RecordMediaResult;
      try {
        res = await latest.current.record({ pathname, filename: job.file.name, ...job.meta });
      } catch (err) {
        // The call itself failed (no signal, an error page, an action retired by a deploy), not a
        // refusal: its own words mean nothing here. A redirect isn't rethrown: the router is
        // already navigating, and this runs detached, so a rethrow would only go unhandled.
        res = { ok: false, error: isOfflineError(err) ? "no connection" : "it couldn't be saved" };
      }
      if (!res.ok || !res.data) throw new Error(res.error || "it couldn't be saved");
      recorded.current.push(res.data.id);
      jobs.current.delete(key);
      drop(key);
    } catch (e) {
      if (controller.signal.aborted || !jobs.current.has(key)) return;
      // The browser's and Blob's own words for a dropped connection ("Failed to fetch", "Load failed",
      // "The blob service is currently not available") mean nothing to anyone.
      patch(key, { status: "failed", error: uploadFailureReason(e) });
    } finally {
      job.controller = null;
    }
  }

  /** Whether this queued file sends its bytes in parts (a record-only retry sends none). */
  const goesMultipart = (key: string) => {
    const job = jobs.current.get(key);
    return !!job && !job.pathname && usesMultipart(job.file.size);
  };

  function pump() {
    while (active.current < CONCURRENCY) {
      // The next file in line, passing over multipart ones while one is already going up.
      const i = queue.current.findIndex((k) => !multipartActive.current || !goesMultipart(k));
      if (i < 0) break;
      const [key] = queue.current.splice(i, 1);
      const multipart = goesMultipart(key);
      if (multipart) multipartActive.current = true;
      active.current++;
      void run(key).finally(() => {
        active.current--;
        if (multipart) multipartActive.current = false;
        pump();
        if (active.current === 0 && queue.current.length === 0 && recorded.current.length > 0) {
          const ids = recorded.current;
          recorded.current = [];
          latest.current.onRecorded?.(ids);
        }
      });
    }
  }

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    const added: MediaUpload[] = [];
    for (const file of files) {
      const key = `m${++seq.current}`;
      const check = checkMediaFile(file, latest.current.allowed);
      const kind = check.ok ? check.fileKind : null;
      const previewUrl = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
      if (previewUrl) previews.current.set(key, previewUrl);
      if (check.ok) {
        jobs.current.set(key, { file, contentType: check.contentType, fileKind: check.fileKind, controller: null });
        queue.current.push(key);
      }
      added.push({
        key,
        name: file.name,
        kind,
        previewUrl,
        progress: 0,
        status: check.ok ? "queued" : "invalid",
        error: check.ok ? undefined : check.error,
      });
    }
    setUploads((us) => [...us, ...added]);
    pump();
  }

  function retry(key: string) {
    const job = jobs.current.get(key);
    if (!job || job.controller) return;
    patch(key, { status: "queued", progress: 0, error: undefined });
    queue.current.push(key);
    pump();
  }

  function remove(key: string) {
    const job = jobs.current.get(key);
    jobs.current.delete(key);
    queue.current = queue.current.filter((k) => k !== key);
    job?.controller?.abort();
    drop(key);
  }

  // Leaving the page: stop uploads and free the previews.
  useEffect(() => {
    const live = jobs.current;
    const shown = previews.current;
    return () => {
      for (const job of live.values()) job.controller?.abort();
      live.clear();
      for (const url of shown.values()) URL.revokeObjectURL(url);
      shown.clear();
    };
  }, []);

  const pending = uploads.filter(isGoingUp).length;
  const failed = uploads.filter((u) => u.status === "failed" || u.status === "invalid").length;
  useEffect(() => {
    latest.current.onPendingChange?.(pending);
  }, [pending]);

  // Leaving the page cancels whatever is still going up, so the browser asks first.
  useLeaveWarning(pending > 0);

  const notice = uploadNotice(uploads.filter((u) => u.error).map((u) => ({ name: u.name, kind: u.kind, reason: u.error! })));

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };
  const inputs = (
    <>
      <input ref={cameraRef} type="file" accept={CAMERA_ACCEPT} capture="environment" hidden onChange={onPicked} />
      <input ref={filesRef} type="file" accept={pickerAccept(options.allowed)} multiple hidden onChange={onPicked} />
    </>
  );

  return {
    uploads,
    pending,
    failed,
    notice,
    takePhoto: () => cameraRef.current?.click(),
    chooseFiles: () => filesRef.current?.click(),
    addFiles,
    retry,
    remove,
    inputs,
  };
}

/**
 * While `active`, the browser asks before the page goes away: a reload,
 * closing the tab, a typed URL. In-app links don't fire beforeunload, and iOS
 * Safari never asks.
 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Older Chrome and Safari still look for this.
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

/** Width, height and length when the browser can read them quickly; never blocks an upload for long. */
async function readMediaMeta(file: File, kind: FileKind): Promise<MediaMeta> {
  if (kind !== "image" && kind !== "video") return {};
  const url = URL.createObjectURL(file);
  const read = new Promise<MediaMeta>((resolve) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      img.onerror = () => resolve({});
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () =>
        resolve({
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
          durationSec: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined,
        });
      v.onerror = () => resolve({});
      v.src = url;
    }
  });
  const timeout = new Promise<Record<string, never>>((resolve) => setTimeout(() => resolve({}), META_TIMEOUT_MS));
  try {
    return await Promise.race([read, timeout]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The default triggers: the camera on touch screens, and the file picker. */
function DefaultTriggers({ api }: { api: MediaUploaderApi }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={api.takePhoto} className="pointer-fine:hidden">
        <Camera className="h-4 w-4" aria-hidden="true" />
        Take photo or video
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={api.chooseFiles}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        Choose files
      </Button>
    </div>
  );
}

export function MediaUploader({
  children,
  className,
  ...options
}: MediaUploaderOptions & { children?: (api: MediaUploaderApi) => ReactNode; className?: string }) {
  const api = useMediaUploader(options);
  return (
    <div className={cn("space-y-2", className)}>
      {api.inputs}
      {children ? children(api) : <DefaultTriggers api={api} />}
      <MediaUploadTray uploader={api} />
    </div>
  );
}

/** The 56px thumbnails of files in flight, with progress, Retry and Remove, and one line about failures. */
export function MediaUploadTray({ uploader, className }: { uploader: MediaUploaderApi; className?: string }) {
  const { uploads, notice, retry, remove } = uploader;
  if (uploads.length === 0) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      <ul className="flex flex-wrap gap-2">
        {uploads.map((u) => (
          <UploadTile key={u.key} upload={u} onRetry={() => retry(u.key)} onRemove={() => remove(u.key)} />
        ))}
      </ul>
      {notice && <p className="truncate text-xs text-red-600 dark:text-red-400">{notice}</p>}
    </div>
  );
}

function UploadTile({ upload: u, onRetry, onRemove }: { upload: MediaUpload; onRetry: () => void; onRemove: () => void }) {
  const [broken, setBroken] = useState(false);
  const failed = u.status === "failed" || u.status === "invalid";
  const state =
    u.status === "invalid" || u.status === "failed"
      ? `couldn't upload: ${shownReason(u.error ?? "")}`
      : u.status === "saving"
        ? "saving"
        : u.status === "queued"
          ? "waiting"
          : `uploading, ${Math.round(u.progress * 100)}%`;

  return (
    <li
      aria-label={`${u.name}, ${state}`}
      className="relative h-14 w-14 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800"
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {u.previewUrl && !broken && u.kind === "image" && (
          // An object URL of the picked file: next/image can't optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.previewUrl} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {u.previewUrl && !broken && u.kind === "video" && (
          <video
            src={`${u.previewUrl}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
        {u.kind === "video" && (
          <Play className="absolute bottom-1 left-1 h-3 w-3 fill-white text-white drop-shadow" aria-hidden="true" />
        )}
        {u.status !== "invalid" && u.status !== "failed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <ProgressRing value={u.status === "queued" ? 0 : u.progress} />
          </div>
        )}
        {u.status === "invalid" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <TriangleAlert className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        )}
        {/* The edge sits over the preview, so a failed tile's red ring shows on a photo too. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-lg ring-inset",
            failed ? "ring-2 ring-red-500" : "ring-1 ring-black/5 dark:ring-white/10",
          )}
        />
      </div>
      {u.status === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Retry ${u.name}`}
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCw className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${u.name}`}
        className={cn(
          "absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow ring-2 ring-surface outline-none",
          "focus-visible:ring-primary dark:bg-zinc-700",
          "after:absolute after:-inset-3 pointer-fine:after:-inset-1",
        )}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </li>
  );
}

/** A 24px ring that fills clockwise. The tile's label carries the percentage. */
function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/30" />
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
        className="text-white transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
      />
    </svg>
  );
}
