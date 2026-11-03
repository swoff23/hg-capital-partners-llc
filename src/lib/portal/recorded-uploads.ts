import type { FileKind } from "@/lib/attachments/content-types";
import { sendRefusal } from "@/lib/composer-draft";
import { MAX_FILES_PER_POST } from "@/lib/portal/job-view";

/** A file that's up and recorded, waiting to be posted: what the Mark done sheet shows in its slot and the payoff in its strip. */
export type RecordedUpload = {
  id: string;
  name: string;
  kind: FileKind | null;
  hasThumb: boolean;
  hasPoster: boolean;
};

/**
 * What each recorded file is, by job, for whichever job page posts it. The
 * record step answers with the id alone, and a batch can start under one job
 * page and land under the next: the contractor leaves while photos 1 to 3
 * record and comes back before 4 and 5 do, and the queue hands all five ids
 * to the page that's open then. Kept per tab, outside any page (as
 * listing-photos' sessionUploads is), so none of the five is dropped. A file
 * no page here noted (a reload in between) still comes back, by id alone.
 * There is one for each upload queue's scope (recordedUploadsOf), so what one
 * person's queue recorded or kept only ever posts for them.
 */
export class RecordedUploads {
  private readonly byJob = new Map<string, Map<string, RecordedUpload>>();
  /** Files a post handed back (keep), by job, for the next batch of that job. */
  private readonly unsent = new Map<string, Map<string, RecordedUpload>>();

  note(taskId: string, upload: RecordedUpload): void {
    const job = this.byJob.get(taskId) ?? new Map<string, RecordedUpload>();
    job.set(upload.id, upload);
    this.byJob.set(taskId, job);
  }

  /**
   * The files for these ids, in their order, each let go of here once handed over. Files a post that didn't go
   * through kept (keep) come first: they ride with this batch, so HG still hears of them. `room` is how many the
   * caller can hold (a tray holds what one Send or Mark done takes, MAX_FILES_PER_POST); the files past it stay
   * kept, in the same order, for the next batch.
   */
  take(taskId: string, ids: readonly string[], room = Infinity): RecordedUpload[] {
    const job = this.byJob.get(taskId);
    const kept = this.unsent.get(taskId) ?? new Map<string, RecordedUpload>();
    this.unsent.delete(taskId);
    const named = ids.map((id) => job?.get(id) ?? kept.get(id) ?? { id, name: "", kind: null, hasThumb: false, hasPoster: false });
    if (job) {
      for (const id of ids) job.delete(id);
      if (job.size === 0) this.byJob.delete(taskId);
    }
    const all = [...[...kept.values()].filter((r) => !ids.includes(r.id)), ...named];
    const fit = Math.max(0, room);
    this.keep(taskId, all.slice(fit));
    return all.slice(0, fit);
  }

  /**
   * A batch whose post didn't go through (no signal, a blip, the job closing under a held photo): its files are on
   * the job already but HG hasn't heard of them, so they wait here, kinds and all, for the next batch this tab
   * posts for the job (take), or the next time a page for the job opens or goes (drainKept). A reload lets them go;
   * they stay on the job, unposted, as before.
   */
  keep(taskId: string, items: readonly RecordedUpload[]): void {
    if (items.length === 0) return;
    const held = this.unsent.get(taskId) ?? new Map<string, RecordedUpload>();
    for (const item of items) held.set(item.id, item);
    this.unsent.set(taskId, held);
  }

  /** The jobs this tab kept files for (keep), for a drain of every one of them (drainEveryKept). */
  keptJobs(): string[] {
    return [...this.unsent.keys()];
  }
}

/**
 * Posts files in pieces of at most `size` (the most one post takes), one piece after another, and stops at the
 * first piece that doesn't go through. Answers the files not posted, none when every piece went, so a caller
 * keeps just those. `post` answers whether its piece went.
 */
export async function postInBatches<T>(items: readonly T[], post: (piece: T[]) => Promise<boolean>, size = MAX_FILES_PER_POST): Promise<T[]> {
  for (let at = 0; at < items.length; at += size) {
    if (!(await post(items.slice(at, at + size)))) return items.slice(at);
  }
  return [];
}

/**
 * The files a post told HG of, for its toast: the ones it linked. A file kept from a post whose answer was lost
 * is on the job and was told of then, so it isn't counted again. A post with nothing new (every one was posted
 * already, or is gone from the job) told of none, and its toast says nothing.
 */
export function toldOf<T extends { id: string }>(piece: readonly T[], linked: readonly string[]): T[] {
  return piece.filter((item) => linked.includes(item.id));
}

const byScope = new Map<string, RecordedUploads>();

/**
 * The tab's registry for one upload queue's scope ("portal:<contact id>", useUploadScope), which every job page
 * reads and writes for its queue: files kept for one contractor post only for them, never for whoever signs in
 * on the tab next.
 */
export function recordedUploadsOf(scope: string | undefined): RecordedUploads {
  const key = scope ?? "";
  const known = byScope.get(key);
  if (known) return known;
  const tab = new RecordedUploads();
  byScope.set(key, tab);
  return tab;
}

/**
 * Posts files that have no tray to go back to (a finished job's page, a batch that landed after its page went, what
 * the tab kept), and keeps the ones `post` answers didn't go, for the next batch or drain of the job. A post that
 * throws (the session ended, so the call redirects) answers nothing: everything stays kept for the next sign-in on
 * this tab. A piece that had already posted answers quietly when sent again.
 */
export async function postOrKeep(
  scope: string | undefined,
  taskId: string,
  items: readonly RecordedUpload[],
  post: (items: RecordedUpload[]) => Promise<RecordedUpload[]>,
): Promise<void> {
  let left: readonly RecordedUpload[] = items;
  try {
    if (items.length > 0) left = await post([...items]);
  } finally {
    recordedUploadsOf(scope).keep(taskId, left);
  }
}

/** The jobs whose kept files are posting now, by scope and job: one drain at a time for each. */
const draining = new Set<string>();

/**
 * Hands every file the tab kept for the job (keep) to `post`, and keeps again the ones it answers didn't go
 * (postOrKeep). One drain at a time for each scope and job: a call while one is running does nothing, since that one
 * took every kept file, so a page going as the next one opens (or a page and its own Send) makes one post of them,
 * not two at once.
 */
export async function drainKept(
  scope: string | undefined,
  taskId: string,
  post: (kept: RecordedUpload[]) => Promise<RecordedUpload[]>,
): Promise<void> {
  const job = `${scope ?? ""}|${taskId}`;
  if (draining.has(job)) return;
  draining.add(job);
  try {
    await postOrKeep(scope, taskId, recordedUploadsOf(scope).take(taskId, []), post);
  } finally {
    draining.delete(job);
  }
}

/**
 * Drains every job the tab kept files for, one after another (drainKept): the signal or the tab came back
 * (UploadQueueProvider's `onWake`), so files a post couldn't send while it was gone go now, on whatever page is
 * open, instead of waiting for that job's page to open again.
 */
export async function drainEveryKept(
  scope: string | undefined,
  post: (taskId: string, kept: RecordedUpload[]) => Promise<RecordedUpload[]>,
): Promise<void> {
  for (const taskId of recordedUploadsOf(scope).keptJobs()) await drainKept(scope, taskId, (kept) => post(taskId, kept));
}

/**
 * The toast for a post of recorded files that didn't go: the server's line, with Retry when another try may work (no
 * signal, a server hiccup) and the caller has one to give. A refusal trying again can't change says only why.
 */
export function failedPostToast(error: string, retry?: () => void): { message: string; action?: { label: string; onAction: () => void } } {
  return retry && sendRefusal(error) === null ? { message: error, action: { label: "Retry", onAction: retry } } : { message: error };
}
