import { OFFLINE_ERROR, isOfflineError } from "@/lib/action-result";
import type { MediaUpload, RecordMediaInput, RecordMediaResult } from "@/components/media-uploader";
import type { UploadCounts, UploadTarget } from "@/components/upload-queue";
import { usesMultipart, type FileKind } from "./content-types";
import { checkMediaFile, storedNames, uploadCountPhrase, uploadFailureReason, withExtension } from "./media";
import {
  STALL_MS,
  ServerBusyError,
  StalledError,
  afterFailure,
  classifyFailure,
  resumable,
  type MultipartState,
  type OutboxEntry,
  type OutboxStore,
} from "./outbox";
import { PrepareError, UNREADABLE_PHOTO, type PrepareMode, type Prepared, prepareFile } from "./prepare";
import type { Transfer } from "./transfer";
import { UPLOAD_KIND_PREVIEWS, uploadTargetHref, type UploadKind } from "./upload-kinds";

/**
 * The upload queue's engine (docs/specs/uploads-photos.md 2.1): checks,
 * prepares, queues and sends every file for every surface, keeps going when
 * the page that started it is gone, and tells whoever is showing a target its
 * tiles and counts. Plain TypeScript with its browser parts passed in, so
 * engine.test.ts drives it with fakes and a clock; components/upload-queue.tsx
 * is its React side.
 *
 * Life of a file: add (the check, the stored name, a tile with its preview)
 * to the outbox, prepare one at a time (thumbnail, poster, the display JPEG),
 * send three at a time (one multipart file at a time), record through the
 * target's record step, and drop out of the queue. A request that fails with
 * no signal Waits and tries again; only a refusal, or four failed tries while
 * online, turns a tile red (outbox.ts).
 *
 * A target's page may be gone by the time a batch lands. The queue then
 * keeps the files where they were recorded: a staff target holds them as
 * drafts (and says "3 files ready to send" in a toast, with View), a
 * contractor's target hands them to its `onAway`, which posts them.
 */

const CONCURRENCY = 3;

type JobStatus = MediaUpload["status"];

/** The part of a target a file keeps after the page that set it is gone. */
type Spec = {
  uploadKind: UploadKind;
  parentId: string;
  access: "private" | "public";
  allowed: readonly FileKind[];
  prepare: PrepareMode;
  label: string;
  whenAway: "hold" | "post";
};

type Job = {
  id: string;
  key: string;
  batchId: string;
  queuedAt: string;
  spec: Spec;
  /** As picked, until it's prepared. */
  original: Blob;
  name: string;
  contentType: string;
  fileKind: FileKind | null;
  status: JobStatus;
  progress: number;
  error?: string;
  previewUrl: string | null;
  prepared: Prepared | null;
  pathname: string | null;
  thumbPathname: string | null;
  posterPathname: string | null;
  multipart: MultipartState | null;
  tries: number;
  waits: number;
  recordFailures: number;
  /** Bytes are up and there is no record step yet: a reload put the file back before its page did. */
  needsRecord: boolean;
  controller: AbortController | null;
  retryTimer: unknown;
  stallTimer: unknown;
  stalled: boolean;
  /** The write of this file to the outbox that is under way (or done), so nothing is prepared or sent before it. */
  writing: Promise<void> | null;
  /** Bytes, for the tile and the row. */
  size: number;
  /** Lets go of this tab's claim on the file (deps.claim), once it is recorded or removed. */
  lease: (() => void) | null;
  /** Its row is in the outbox, so a reload resumes it. A file whose write never went through is lost by a reload. */
  stored: boolean;
};

export type EngineNotice = {
  message: string;
  /** A toast with the key of one showing replaces it. */
  key?: string;
  action?: { label: string; run: () => void };
};

export type EngineDeps = {
  transfer: Transfer;
  prepare?: typeof prepareFile;
  /** null where there is no IndexedDB: the queue still works, it just can't survive a reload. */
  outbox: OutboxStore | null;
  notify: (notice: EngineNotice) => void;
  navigate: (href: string) => void;
  online: () => boolean;
  now: () => Date;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  preview: { create: (blob: Blob) => string | null; revoke: (url: string) => void };
  uid: () => string;
  /** Asks the browser to keep the outbox (navigator.storage.persist()); once, when the first file joins. */
  persist?: () => void;
  /**
   * Whose queue this is: "app:<user id>" in the app, "portal:<contact id>" in the contractor portal. One browser database serves
   * both layouts and everyone who signs in on it, so a queue only picks up the files of its own scope.
   */
  scope?: string;
  /**
   * Takes ownership of a file for as long as this tab lives (a Web Lock named for it), so a second tab, or a reload in
   * another one, doesn't send and record the same file again. Resolves to what lets go of it, or null when another
   * tab holds it. Without it every file is ours.
   */
  claim?: (id: string) => Promise<(() => void) | null>;
};

/** The tiles of a target with none: one shared array, so a server snapshot and an idle client one are the same. */
export const NO_UPLOADS: readonly MediaUpload[] = [];
const EMPTY = NO_UPLOADS;
/** The counts of a target with nothing in flight: shared, so a server snapshot and an idle client one are the same. */
export const NO_COUNTS: UploadCounts = { pending: 0, waiting: 0, failed: 0, pendingKinds: [] };

/** "no more can be added here", "only 3 more can be added here": the reason a file past a target's cap gives. */
export function capReason(remaining: number): string {
  return remaining <= 0 ? "no more can be added here" : `only ${remaining} more can be added here`;
}

/** The record step said no: the page has the reason. */
class RecordRefused extends Error {}
/** The record call itself threw (a 500, an error page, an action a deploy retired): the road, not the file. It tries again. */
class RecordThrew extends Error {}

const isInFlight = (s: JobStatus) => s === "queued" || s === "uploading" || s === "saving" || s === "waiting";

export class UploadEngine {
  private readonly deps: EngineDeps;
  private readonly jobs = new Map<string, Job>();
  /** The latest target a page set for each key: its record step and the rest. */
  private readonly targets = new Map<string, UploadTarget>();
  /** How many pages are showing each key now. */
  private readonly mounts = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly uploadCache = new Map<string, readonly MediaUpload[]>();
  private readonly countCache = new Map<string, UploadCounts>();
  /** Ids recorded in a batch and not yet handed to its target. */
  private readonly recordedByBatch = new Map<string, string[]>();
  private active = 0;
  private multipartActive = false;
  private preparing = false;
  private persistAsked = false;
  private restored = false;
  /** Set by dispose(): the queue's provider is gone, and nothing here runs again. */
  private disposed = false;
  /** Keys that already told the person their files are waiting for a page to record them. */
  private readonly pageNoticed = new Set<string>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  /**
   * The toast and navigation the page has right now. A provider outlives
   * renders, so it hands over the latest each render instead of building the
   * engine around the first.
   */
  setHandlers(handlers: Partial<Pick<EngineDeps, "notify" | "navigate">>): void {
    Object.assign(this.deps, handlers);
  }

  /**
   * The queue's provider is gone: Sign out left its layout, or the portal
   * mounted a new queue for whoever signed in next. Stops for good. Each
   * upload in flight is aborted, its timers cleared and its claim let go, and
   * its outbox row stays, so the same person's next queue picks it up where
   * it was. Nothing records, posts, saves or toasts after this: a target's
   * record step is the page that set it, and it would run under whoever is
   * signed in by then. A record call already on its way finishes on the
   * server, and its row comes back to the next queue, which records it again
   * as the same row (core.findOwnUpload).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of this.jobs.values()) {
      job.controller?.abort();
      this.deps.clearTimer(job.retryTimer);
      this.deps.clearTimer(job.stallTimer);
      job.retryTimer = null;
      job.stallTimer = null;
      if (job.previewUrl) this.deps.preview.revoke(job.previewUrl);
      job.previewUrl = null;
      const lease = job.lease;
      job.lease = null;
      lease?.();
    }
    this.jobs.clear();
    this.targets.clear();
    this.mounts.clear();
    this.recordedByBatch.clear();
    this.uploadCache.clear();
    this.countCache.clear();
  }

  /* ---------------- Reading ---------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The tiles of one target, oldest first. The same array until something in that target changes. */
  uploadsFor = (key: string): readonly MediaUpload[] => {
    const cached = this.uploadCache.get(key);
    if (cached) return cached;
    const list = [...this.jobs.values()].filter((j) => j.key === key).map((j) => this.view(j));
    const shown = list.length > 0 ? list : EMPTY;
    this.uploadCache.set(key, shown);
    return shown;
  };

  /** Counts for one target, or for every target with no key. The same object until something changes. */
  counts = (key?: string): UploadCounts => {
    const cacheKey = key ?? "";
    const cached = this.countCache.get(cacheKey);
    if (cached) return cached;
    const own = [...this.jobs.values()].filter((j) => key === undefined || j.key === key);
    const pending = own.filter((j) => j.status === "queued" || j.status === "uploading" || j.status === "saving");
    const counts: UploadCounts =
      own.length === 0
        ? NO_COUNTS
        : {
            pending: pending.length,
            waiting: own.filter((j) => j.status === "waiting").length,
            failed: own.filter((j) => j.status === "failed" || j.status === "invalid").length,
            pendingKinds: [...pending, ...own.filter((j) => j.status === "waiting")].map((j) => j.fileKind),
          };
    this.countCache.set(cacheKey, counts);
    return counts;
  };

  /** Whether files are in the outbox, so a reload resumes them instead of losing them. */
  get persistent(): boolean {
    return this.deps.outbox !== null;
  }

  /** Whether a reload right now would lose files: any in flight whose row never made it into the outbox (no outbox at all, a quota, a private window). */
  needsLeaveWarning = (): boolean => {
    for (const j of this.jobs.values()) if (isInFlight(j.status) && !j.stored) return true;
    return false;
  };

  private view(j: Job): MediaUpload {
    return {
      key: j.id,
      name: j.name,
      kind: j.fileKind,
      previewUrl: j.previewUrl,
      progress: j.progress,
      status: j.status,
      error: j.error,
      batchId: j.batchId,
      size: j.size,
    };
  }

  private emit(...keys: string[]) {
    for (const key of keys) this.uploadCache.delete(key);
    this.countCache.clear();
    for (const l of [...this.listeners]) l();
  }

  private patch(job: Job, p: Partial<Job>) {
    Object.assign(job, p);
    this.emit(job.key);
  }

  /* ---------------- Targets ---------------- */

  /**
   * A page sets its target (every render, so the queue always holds the
   * latest record step) and says it's there. A file whose bytes are up and
   * which was waiting for a record step to exist goes on to record.
   */
  setTarget(target: UploadTarget): void {
    if (this.disposed) return;
    this.targets.set(target.key, target);
    let released = false;
    this.pageNoticed.delete(target.key);
    for (const j of this.jobs.values()) {
      if (j.key === target.key && j.needsRecord) {
        j.needsRecord = false;
        this.requeue(j);
        released = true;
      }
    }
    if (released) this.pump();
  }

  /** The page is there. Returns what to call when it goes: the files keep going, and a batch that lands later is "away". */
  mount(key: string): () => void {
    this.mounts.set(key, (this.mounts.get(key) ?? 0) + 1);
    return () => {
      this.mounts.set(key, Math.max(0, (this.mounts.get(key) ?? 1) - 1));
    };
  }

  private isAway(key: string): boolean {
    return (this.mounts.get(key) ?? 0) === 0;
  }

  /* ---------------- Adding ---------------- */

  private specOf(t: UploadTarget): Spec {
    return {
      uploadKind: t.uploadKind,
      parentId: t.parentId,
      access: t.access,
      allowed: t.allowed,
      prepare: t.prepare,
      label: t.label,
      whenAway: t.whenAway,
    };
  }

  /**
   * Queues files for a target as one batch (picked, dropped or pasted
   * together): one activity line and one confirmation. Each gets its check
   * now, before any bytes move; a file past the target's cap, or the check's,
   * gets a refused tile with its reason.
   */
  add(target: UploadTarget, files: FileList | readonly File[]): void {
    const list = Array.from(files);
    if (list.length === 0 || this.disposed) return;
    this.setTarget(target);
    const now = this.deps.now();
    const batchId = `b_${this.deps.uid()}`;
    const names = storedNames(list.map((f) => ({ name: f.name, type: f.type, lastModified: f.lastModified })), now);
    const spec = this.specOf(target);
    let room = target.maxFiles === undefined ? Infinity : Math.max(0, target.maxFiles - this.holding(target.key));
    for (const [i, file] of list.entries()) {
      const name = names[i];
      const check = checkMediaFile({ name, type: file.type, size: file.size }, target.allowed);
      const id = `u_${this.deps.uid()}`;
      let error: string | undefined = check.ok ? undefined : check.error;
      if (check.ok && room <= 0) error = capReason(0);
      else if (check.ok) room -= 1;
      const fileKind = check.ok ? check.fileKind : null;
      const previewUrl = fileKind === "image" || fileKind === "video" ? this.deps.preview.create(file) : null;
      this.jobs.set(id, {
        id,
        key: target.key,
        batchId,
        queuedAt: now.toISOString(),
        spec,
        original: file,
        name,
        contentType: check.ok ? check.contentType : file.type,
        fileKind,
        status: error ? "invalid" : "queued",
        progress: 0,
        error,
        previewUrl,
        prepared: null,
        pathname: null,
        thumbPathname: null,
        posterPathname: null,
        multipart: null,
        tries: 0,
        waits: 0,
        recordFailures: 0,
        needsRecord: false,
        controller: null,
        retryTimer: null,
        stallTimer: null,
        stalled: false,
        writing: null,
        size: file.size,
        lease: null,
        stored: false,
      });
    }
    // Every file goes in the outbox before any bytes move, the whole batch at once, so a tab closed
    // while the first is being prepared doesn't lose the rest. The claim comes first: a row another tab
    // can see is already ours.
    for (const job of this.jobs.values()) {
      if (job.batchId === batchId && job.status === "queued") job.writing = this.hold(job).then(() => this.save(job));
    }
    this.emit(target.key);
    if (!this.persistAsked) {
      this.persistAsked = true;
      this.deps.persist?.();
    }
    void this.prepareNext();
  }

  /** Files of this target that count against its cap: queued, going up or waiting (a refused tile holds no room). */
  private holding(key: string): number {
    return [...this.jobs.values()].filter((j) => j.key === key && isInFlight(j.status)).length;
  }

  /* ---------------- Preparing ---------------- */

  private async prepareNext(): Promise<void> {
    if (this.preparing || this.disposed) return;
    const job = [...this.jobs.values()].find((j) => j.status === "queued" && !j.prepared);
    if (!job) return;
    this.preparing = true;
    try {
      await (job.writing ?? this.save(job));
      if (!this.jobs.has(job.id)) return;
      const input = {
        name: job.name,
        contentType: job.contentType,
        fileKind: job.fileKind!,
        mode: job.spec.prepare,
        previews: UPLOAD_KIND_PREVIEWS[job.spec.uploadKind],
        // A public photo that can't be re-encoded is refused (it would keep its GPS); a private one goes as picked.
        strict: job.spec.access === "public",
      };
      const source = job.original instanceof File ? job.original : new File([job.original], job.name, { type: job.contentType });
      let prepared: Prepared;
      try {
        prepared = await (this.deps.prepare ?? prepareFile)(source, input);
      } catch (err) {
        if (err instanceof PrepareError) {
          if (this.jobs.has(job.id)) this.patch(job, { status: "invalid", error: err.message });
          return;
        }
        // A photo going public that couldn't be prepared for any other reason is refused too: as picked it would keep its GPS.
        if (input.strict) {
          if (this.jobs.has(job.id)) this.patch(job, { status: "invalid", error: UNREADABLE_PHOTO });
          return;
        }
        // Anything else: it goes up as picked, with no preview.
        prepared = { blob: source, name: job.name, contentType: job.contentType, thumb: null, poster: null, meta: {} };
      }
      if (!this.jobs.has(job.id)) return;
      this.adopt(job, prepared);
      await this.save(job);
    } finally {
      this.preparing = false;
      this.pump();
      void this.prepareNext();
    }
  }

  /** The prepared file replaces the picked one: its name, its type, and a preview that every browser can draw. */
  private adopt(job: Job, prepared: Prepared) {
    let previewUrl = job.previewUrl;
    if (prepared.thumb && job.fileKind === "image") {
      const url = this.deps.preview.create(prepared.thumb);
      if (url) {
        if (previewUrl) this.deps.preview.revoke(previewUrl);
        previewUrl = url;
      }
    }
    Object.assign(job, { prepared, name: prepared.name, contentType: prepared.contentType, previewUrl });
    // A display photo's original is not kept; a photo sent as picked is the same blob.
    job.original = prepared.blob;
    this.emit(job.key);
  }

  /* ---------------- Sending ---------------- */

  private pump(): void {
    while (this.active < CONCURRENCY && !this.disposed) {
      const next = [...this.jobs.values()].find(
        (j) => j.status === "queued" && j.prepared && !j.controller && !j.retryTimer && !(this.multipartActive && this.goesInParts(j)),
      );
      if (!next) break;
      const parts = this.goesInParts(next);
      if (parts) this.multipartActive = true;
      this.active++;
      void this.run(next).finally(() => {
        this.active--;
        if (parts) this.multipartActive = false;
        this.pump();
      });
    }
  }

  /** Whether this file's bytes go up in parts (a record-only retry sends none). */
  private goesInParts(j: Job): boolean {
    return !!j.prepared && !j.pathname && usesMultipart(j.prepared.blob.size);
  }

  private armStall(job: Job, controller: AbortController) {
    this.deps.clearTimer(job.stallTimer);
    job.stallTimer = this.deps.setTimer(() => {
      job.stalled = true;
      controller.abort(new StalledError());
    }, STALL_MS);
  }

  private async run(job: Job): Promise<void> {
    const controller = new AbortController();
    job.controller = controller;
    job.stalled = false;
    this.patch(job, { status: "uploading", progress: job.pathname ? 1 : 0, error: undefined });
    try {
      const prepared = job.prepared!;
      const progress = (fraction: number) => {
        this.armStall(job, controller);
        if (this.jobs.has(job.id)) this.patch(job, { progress: fraction });
      };
      this.armStall(job, controller);
      const send = (role: "orig" | "thumb" | "poster", blob: Blob, name: string, contentType: string, fileKind: FileKind) =>
        this.deps.transfer({
          uploadKind: job.spec.uploadKind,
          parentId: job.spec.parentId,
          access: job.spec.access,
          name,
          contentType,
          fileKind,
          role,
          blob,
          queuedAt: job.queuedAt,
          resume: role === "orig" ? job.multipart : null,
          onMultipart: (state) => {
            if (role !== "orig") return;
            job.multipart = state;
            void this.save(job);
          },
          onProgress: role === "orig" ? progress : () => this.armStall(job, controller),
          signal: controller.signal,
        });

      if (!job.pathname) {
        const sent = await send("orig", prepared.blob, job.name, job.contentType, job.fileKind!);
        job.pathname = sent.pathname;
        job.multipart = null;
        await this.save(job);
      }
      if (!this.jobs.has(job.id)) return;

      // A thumbnail and a poster are conveniences: a refusal, or the last try, leaves them out rather than turning the file red.
      const lastTry = job.tries >= 3;
      const jpeg = withExtension(job.name, "jpg");
      for (const [role, blob, have] of [
        ["thumb", prepared.thumb, job.thumbPathname],
        ["poster", prepared.poster, job.posterPathname],
      ] as const) {
        if (!blob || have) continue;
        try {
          const sent = await send(role, blob, jpeg, "image/jpeg", "image");
          if (role === "thumb") job.thumbPathname = sent.pathname;
          else job.posterPathname = sent.pathname;
        } catch (err) {
          if (!this.jobs.has(job.id) || (controller.signal.aborted && !job.stalled)) return;
          if (lastTry || classifyFailure(err, this.deps.online()) === "refused") {
            prepared[role === "thumb" ? "thumb" : "poster"] = null;
          } else {
            throw err;
          }
        }
      }
      if (!this.jobs.has(job.id)) return;

      this.deps.clearTimer(job.stallTimer);
      this.patch(job, { status: "saving", progress: 1 });
      await this.record(job);
    } catch (err) {
      this.deps.clearTimer(job.stallTimer);
      if (!this.jobs.has(job.id)) return;
      // Removed (aborted by remove()) is not a failure.
      if (controller.signal.aborted && !job.stalled) return;
      this.fail(job, err);
    } finally {
      this.deps.clearTimer(job.stallTimer);
      job.controller = null;
    }
  }

  private async record(job: Job): Promise<void> {
    if (this.disposed) return;
    const target = this.targets.get(job.key);
    if (!target) {
      // The page that would record this file isn't open yet (a reload put it back first).
      this.patch(job, { needsRecord: true });
      this.noticePageNeeded(job);
      return;
    }
    const prepared = job.prepared!;
    const input: RecordMediaInput = { pathname: job.pathname!, filename: job.name, ...prepared.meta };
    if (job.thumbPathname) input.thumbPathname = job.thumbPathname;
    if (job.posterPathname) input.posterPathname = job.posterPathname;
    if (target.sendQueuedAt) input.queuedAt = job.queuedAt;
    let res: RecordMediaResult;
    try {
      res = await target.record(input);
    } catch (err) {
      // The call itself failed (no signal, an error page, an action retired by a deploy), not a refusal:
      // its own words mean nothing here, and it tries again like any request the road dropped.
      if (isOfflineError(err)) throw new TypeError("Failed to fetch");
      throw new RecordThrew("it couldn't be saved");
    }
    // Stopped while the call was out: the row stays in the outbox for the next queue, and nothing is handed to a page.
    if (this.disposed) return;
    if (!res.ok || !res.data) {
      if (res.error === OFFLINE_ERROR) throw new TypeError("Failed to fetch");
      throw new RecordRefused(res.error || "it couldn't be saved");
    }
    this.recorded(job, res.data.id);
  }

  private recorded(job: Job, id: string) {
    this.release(job);
    this.jobs.delete(job.id);
    const ids = this.recordedByBatch.get(job.batchId) ?? [];
    ids.push(id);
    this.recordedByBatch.set(job.batchId, ids);
    this.emit(job.key);
    this.settle(job.batchId, job.key);
  }

  /** Frees a finished or removed job's preview, timers and outbox row. */
  private release(job: Job) {
    this.deps.clearTimer(job.retryTimer);
    this.deps.clearTimer(job.stallTimer);
    job.retryTimer = null;
    if (job.previewUrl) this.deps.preview.revoke(job.previewUrl);
    job.previewUrl = null;
    // The row goes first, then the claim: another tab that read the row before it was gone would otherwise find the file free and send it again.
    const lease = job.lease;
    job.lease = null;
    // Whether or not a write got through: a row left behind would put a recorded file back after a reload.
    if (this.deps.outbox) void this.deps.outbox.delete(job.id).catch(() => {}).finally(() => lease?.());
    else lease?.();
  }

  private fail(job: Job, err: unknown) {
    const refusedByRecord = err instanceof RecordRefused;
    const online = this.deps.online();
    const ownWords = err instanceof RecordRefused || err instanceof RecordThrew || err instanceof ServerBusyError;
    const failure = refusedByRecord
      ? "refused"
      : job.stalled
        ? "timeout"
        : err instanceof RecordThrew
          ? online
            ? "network"
            : "offline"
          : classifyFailure(err, online);
    const reason = ownWords ? err.message : failure === "refused" ? uploadFailureReason(err) : "no connection";
    const next = afterFailure({ tries: job.tries, waits: job.waits }, failure);
    if (refusedByRecord) {
      // One record-only retry: a refusal may have discarded the blob, so after that it uploads again.
      job.recordFailures++;
      if (job.recordFailures > 1) Object.assign(job, { pathname: null, thumbPathname: null, posterPathname: null });
    } else if (failure === "refused") {
      // Whatever was half sent is not trusted any more: a retry starts the file over.
      Object.assign(job, { pathname: null, thumbPathname: null, posterPathname: null, multipart: null });
    }
    if (next.phase === "failed") {
      this.patch(job, { status: "failed", error: reason });
      void this.save(job);
      if (this.isAway(job.key)) this.noticeFailure(job);
      this.settle(job.batchId, job.key);
      return;
    }
    job.tries = next.tries;
    job.waits = next.waits;
    this.patch(job, { status: "waiting", error: undefined });
    void this.save(job);
    this.deps.clearTimer(job.retryTimer);
    job.retryTimer = this.deps.setTimer(() => {
      job.retryTimer = null;
      if (this.jobs.has(job.id) && job.status === "waiting") this.requeue(job);
      this.pump();
    }, next.retryInMs);
  }

  private requeue(job: Job) {
    this.deps.clearTimer(job.retryTimer);
    job.retryTimer = null;
    this.patch(job, { status: "queued", error: undefined });
  }

  /**
   * The signal came back (the `online` event) or the tab did: every Waiting
   * file tries now instead of waiting out its timer.
   */
  nudge(): void {
    let any = false;
    for (const j of this.jobs.values()) {
      if (j.status === "waiting" && !j.controller) {
        this.requeue(j);
        any = true;
      }
    }
    if (any) this.pump();
  }

  /* ---------------- Batches ---------------- */

  /**
   * A batch has settled when nothing in it is still on its way. The files
   * that recorded since the last time go to the target: its page's
   * `onRecorded` while it is open, otherwise the away rule. A file that
   * failed stays on its tray with Retry and reports on its own when it lands.
   */
  private settle(batchId: string, key: string): void {
    const batchInFlight = [...this.jobs.values()].some((j) => j.batchId === batchId && isInFlight(j.status));
    const ids = this.recordedByBatch.get(batchId) ?? [];
    if (batchInFlight || ids.length === 0) return;
    this.recordedByBatch.set(batchId, []);
    const target = this.targets.get(key);
    if (!target) return;
    if (!this.isAway(key)) {
      target.onRecorded?.(ids);
      return;
    }
    const failed = [...this.jobs.values()].filter((j) => j.batchId === batchId && j.status === "failed").length;
    if (target.whenAway === "post" && target.onAway) {
      target.onAway(ids, { batchId, failed });
      return;
    }
    this.deps.notify({
      message: `${ids.length === 1 ? "1 file" : `${ids.length} files`} ready to send`,
      key: `upload-ready:${key}`,
      action: { label: "View", run: () => this.deps.navigate(target.href ?? uploadTargetHref(target.uploadKind, target.parentId)) },
    });
  }

  /**
   * Files whose bytes are up but whose page hasn't set its record step (a
   * reload put them back and another page is open): once, a moment later so
   * the rest of the batch has landed, say so, with a way to the page.
   */
  private noticePageNeeded(job: Job) {
    if (this.pageNoticed.has(job.key)) return;
    this.pageNoticed.add(job.key);
    this.deps.setTimer(() => {
      const waiting = [...this.jobs.values()].filter((j) => j.key === job.key && j.needsRecord);
      if (waiting.length === 0 || this.targets.has(job.key)) return;
      const href = uploadTargetHref(job.spec.uploadKind, job.spec.parentId);
      this.deps.notify({
        message: `${waiting.length === 1 ? "1 file is" : `${waiting.length} files are`} waiting to finish`,
        key: `upload-page:${job.key}`,
        action: { label: "View", run: () => this.deps.navigate(href) },
      });
    }, 1500);
  }

  private noticeFailure(job: Job) {
    const kinds = [...this.jobs.values()].filter((j) => j.key === job.key && j.status === "failed").map((j) => j.fileKind);
    this.deps.notify({
      message: `${uploadCountPhrase(kinds)} didn't upload`,
      key: `upload-failed:${job.key}`,
      action: { label: "Retry", run: () => this.retryAll(job.key) },
    });
  }

  /* ---------------- Controls ---------------- */

  /** A failed file tries again from the start. A refused one (the check said no) can only be removed. */
  retry(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "failed" || job.controller) return;
    job.tries = 0;
    job.waits = 0;
    this.requeue(job);
    void this.prepareNext();
    this.pump();
  }

  retryAll(key: string): void {
    for (const j of [...this.jobs.values()]) if (j.key === key && j.status === "failed") this.retry(j.id);
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    job.controller?.abort();
    this.release(job);
    this.emit(job.key);
    this.settle(job.batchId, job.key);
    this.pump();
  }

  /* ---------------- The outbox ---------------- */

  private entryOf(job: Job): OutboxEntry | null {
    if (!job.fileKind) return null;
    const p = job.prepared;
    return {
      id: job.id,
      scope: this.deps.scope ?? "",
      key: job.key,
      batchId: job.batchId,
      queuedAt: job.queuedAt,
      uploadKind: job.spec.uploadKind,
      parentId: job.spec.parentId,
      access: job.spec.access,
      allowed: [...job.spec.allowed],
      prepare: job.spec.prepare,
      label: job.spec.label,
      whenAway: job.spec.whenAway,
      name: job.name,
      contentType: job.contentType,
      fileKind: job.fileKind,
      blob: p ? p.blob : job.original,
      prepared: !!p,
      thumb: p?.thumb ?? null,
      poster: p?.poster ?? null,
      meta: p?.meta ?? {},
      pathname: job.pathname,
      thumbPathname: job.thumbPathname,
      posterPathname: job.posterPathname,
      multipart: job.multipart,
      tries: job.tries,
      waits: job.waits,
      savedAt: this.deps.now().getTime(),
    };
  }

  /** Writes a file's row. A write that fails (the quota, a private window) is ignored: the file still goes up, it just can't survive a reload. */
  private async save(job: Job): Promise<void> {
    const outbox = this.deps.outbox;
    const entry = this.entryOf(job);
    if (!outbox || !entry || !this.jobs.has(job.id)) return;
    try {
      await outbox.put(entry);
      if (!job.stored) {
        job.stored = true;
        this.emit(job.key);
      }
    } catch {
      /* carry on without it */
    }
  }

  /** Takes this tab's claim on a file before its row is visible to other tabs. A claim that can't be made (no Web Locks) leaves the file ours. */
  private async hold(job: Job): Promise<void> {
    const lease = await this.deps.claim?.(job.id).catch(() => () => {});
    if (!lease) return;
    if (this.jobs.get(job.id) !== job) lease();
    else job.lease = lease;
  }

  /**
   * Picks the outbox back up after a reload (once per page load): every file
   * of this queue's scope still worth sending, and not held by another open
   * tab, goes back in its target's queue and carries on.
   */
  async restore(): Promise<void> {
    if (this.restored || this.disposed || !this.deps.outbox) return;
    this.restored = true;
    let entries: OutboxEntry[];
    try {
      entries = await this.deps.outbox.all();
    } catch {
      return;
    }
    if (this.disposed) return;
    const now = this.deps.now().getTime();
    const live = resumable(entries, now);
    for (const e of entries) if (!live.includes(e)) void this.deps.outbox.delete(e.id).catch(() => {});
    // The app and the portal share one database, and so does everyone who signs in on this browser: a queue takes only its own.
    const scope = this.deps.scope ?? "";
    const keep = live.filter((e) => (e.scope ?? "") === scope);
    const touched = new Set<string>();
    for (const e of keep) {
      if (this.jobs.has(e.id)) continue;
      // Another open tab that is still sending this file keeps it.
      const lease = this.deps.claim ? await this.deps.claim(e.id).catch(() => () => {}) : () => {};
      if (!lease) continue;
      if (this.disposed) {
        lease();
        return;
      }
      if (this.jobs.has(e.id)) {
        lease();
        continue;
      }
      const prepared: Prepared | null = e.prepared
        ? { blob: e.blob, name: e.name, contentType: e.contentType, thumb: e.thumb, poster: e.poster, meta: e.meta }
        : null;
      const previewBlob = e.thumb ?? (e.fileKind === "video" ? e.blob : e.fileKind === "image" ? e.blob : null);
      this.jobs.set(e.id, {
        id: e.id,
        key: e.key,
        batchId: e.batchId,
        queuedAt: e.queuedAt,
        spec: {
          uploadKind: e.uploadKind,
          parentId: e.parentId,
          access: e.access,
          allowed: e.allowed,
          prepare: e.prepare,
          label: e.label,
          whenAway: e.whenAway,
        },
        original: e.blob,
        name: e.name,
        contentType: e.contentType,
        fileKind: e.fileKind,
        status: "queued",
        progress: e.pathname ? 1 : 0,
        previewUrl: previewBlob ? this.deps.preview.create(previewBlob) : null,
        prepared,
        pathname: e.pathname,
        thumbPathname: e.thumbPathname,
        posterPathname: e.posterPathname,
        multipart: e.multipart,
        tries: e.tries,
        waits: e.waits,
        recordFailures: 0,
        needsRecord: false,
        controller: null,
        retryTimer: null,
        stallTimer: null,
        stalled: false,
        writing: null,
        size: e.blob.size,
        lease,
        stored: true,
      });
      touched.add(e.key);
    }
    if (touched.size > 0) this.emit(...touched);
    void this.prepareNext();
    this.pump();
  }
}
