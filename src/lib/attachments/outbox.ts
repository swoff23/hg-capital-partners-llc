import { isOfflineError } from "@/lib/action-result";
import type { FileKind } from "./content-types";
import { uploadFailureReason } from "./media";
import type { MediaMeta, PrepareMode } from "./prepare";
import type { UploadKind } from "./upload-kinds";

/**
 * The on-device outbox (docs/specs/uploads-photos.md 2.1, phase 3): every
 * file goes into IndexedDB before any bytes move, with its target, batch,
 * queuedAt and progress, so a reload, a closed tab or a weak signal doesn't
 * lose it. The next page that opens carries on; a multipart upload resumes at
 * its last 8 MB part.
 *
 * Two halves. The retry policy is pure and tested (outbox.test.ts): a request
 * that fails with no signal moves the file to Waiting, not Failed; it retries
 * on the `online` event, on coming back to the tab, and after 2, 5, 15 and 60
 * seconds; it turns red only when the server refuses it, or after 4 failed
 * tries while online. Nothing is dropped on its own. The store is IndexedDB
 * behind a small interface, with a memory twin for tests; where IndexedDB is
 * missing or full the queue still works, it just can't survive a reload.
 * Safari can clear a site's storage after 7 days without a visit, so this is
 * a safety net for hours, not an archive.
 */

/* ---------------- Retry policy ---------------- */

/** How long a Waiting file waits before it tries again, by how many times it already waited (the last holds). */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000] as const;

/** Failed tries while online before a file turns red. */
export const MAX_ONLINE_TRIES = 4;

/** A request that makes no progress for this long is cut off and counted as a timeout. */
export const STALL_MS = 30_000;

/**
 * Why a send failed, as far as the policy cares. `refused` is the server
 * saying no (the token route, the record step, the check): trying again
 * unchanged would only be told no again. The others are the road, not the file.
 */
export type FailureKind = "refused" | "offline" | "timeout" | "network";

export class StalledError extends Error {
  constructor() {
    super("The upload stalled.");
  }
}

/** Whether an error is the connection (no signal, a dropped request, a stall) rather than anyone refusing the file. */
export function classifyFailure(err: unknown, online: boolean): FailureKind {
  if (err instanceof StalledError) return "timeout";
  if (!online) return "offline";
  if (uploadFailureReason(err) === "no connection" || isOfflineError(err)) return "network";
  return "refused";
}

/** How many times a file has failed and waited. */
export type RetryState = { tries: number; waits: number };

export type AfterFailure =
  | { phase: "failed" }
  | { phase: "waiting"; tries: number; waits: number; retryInMs: number };

/** The delay after `waits` earlier waits. */
export function retryDelay(waits: number): number {
  return RETRY_DELAYS_MS[Math.min(waits, RETRY_DELAYS_MS.length - 1)];
}

/**
 * What a failed attempt turns into. A refusal is Failed at once. With no
 * signal the file Waits and the count of tries doesn't move (the phone being
 * offline is not the file's fault). Online, a dropped request or a stall
 * counts as a try; the fourth turns it red. Either way a Waiting file's next
 * try is 2, 5, 15, then every 60 seconds, or sooner on the `online` event.
 */
export function afterFailure(state: RetryState, failure: FailureKind): AfterFailure {
  if (failure === "refused") return { phase: "failed" };
  const tries = failure === "offline" ? state.tries : state.tries + 1;
  if (tries >= MAX_ONLINE_TRIES) return { phase: "failed" };
  return { phase: "waiting", tries, waits: state.waits + 1, retryInMs: retryDelay(state.waits) };
}

/* ---------------- What the outbox keeps ---------------- */

/** Where a multipart upload stands, so a resume sends only the parts that are missing. */
export type MultipartState = {
  /** The pathname the token was asked for; every call names it again. */
  pathname: string;
  key: string;
  uploadId: string;
  parts: { etag: string; partNumber: number }[];
};

/**
 * One file in the outbox: enough of its target to carry on without the page
 * that picked it. The page's record step isn't kept (a function can't be);
 * the next page that sets the target supplies it.
 */
export type OutboxEntry = {
  id: string;
  /** The queue key of the target: "task:<id>", "portal-task:<id>", … */
  key: string;
  batchId: string;
  /** When the file joined the queue (ISO); the late-upload rule reads it. */
  queuedAt: string;
  uploadKind: UploadKind;
  parentId: string;
  access: "private" | "public";
  allowed: FileKind[];
  prepare: PrepareMode;
  label: string;
  whenAway: "hold" | "post";
  /** The stored name, the type the check settled on, and the kind. */
  name: string;
  contentType: string;
  fileKind: FileKind;
  /** The file as picked until it is prepared, then what goes up. */
  blob: Blob;
  prepared: boolean;
  thumb: Blob | null;
  poster: Blob | null;
  meta: MediaMeta;
  /** Where the bytes landed, once they have. */
  pathname: string | null;
  thumbPathname: string | null;
  posterPathname: string | null;
  multipart: MultipartState | null;
  tries: number;
  waits: number;
  savedAt: number;
};

/** Files older than this are dropped when the outbox loads (Safari clears a quiet site after 7 days anyway). */
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Entries still worth resuming at `now`, oldest first. */
export function resumable(entries: readonly OutboxEntry[], now: number): OutboxEntry[] {
  return entries.filter((e) => now - e.savedAt <= OUTBOX_MAX_AGE_MS).sort((a, b) => a.savedAt - b.savedAt);
}

export interface OutboxStore {
  all(): Promise<OutboxEntry[]>;
  put(entry: OutboxEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

/** An outbox in memory: the tests', and what a page falls back to when IndexedDB isn't there. */
export function memoryOutbox(): OutboxStore {
  const rows = new Map<string, OutboxEntry>();
  return {
    all: async () => [...rows.values()],
    put: async (e) => {
      rows.set(e.id, e);
    },
    delete: async (id) => {
      rows.delete(id);
    },
  };
}

const DB_NAME = "hg-upload-outbox";
const STORE = "entries";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * The outbox in IndexedDB, or null where there is none (a server render, a
 * private window that refuses it). Opens on first use. A write that fails
 * (the quota, a private window) rejects; the caller carries on without it.
 */
export function idbOutbox(): OutboxStore | null {
  if (typeof indexedDB === "undefined") return null;
  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("The upload outbox is blocked."));
    }).catch((err) => {
      opened = null;
      throw err;
    }));
  return {
    async all() {
      const db = await open();
      return request<OutboxEntry[]>(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    },
    async put(entry) {
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      await done(tx);
    },
    async delete(id) {
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await done(tx);
    },
  };
}
