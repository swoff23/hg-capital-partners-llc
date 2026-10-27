import type { FileKind } from "@/lib/attachments/content-types";

/** A file that's up and recorded, waiting to be posted: what the Mark done sheet shows in its slot and the payoff in its strip. */
export type RecordedUpload = { id: string; name: string; kind: FileKind | null; hasThumb: boolean; hasPoster: boolean };

/**
 * What each recorded file is, by job, for whichever job page posts it. The
 * record step answers with the id alone, and a batch can start under one job
 * page and land under the next: the contractor leaves while photos 1 to 3
 * record and comes back before 4 and 5 do, and the queue hands all five ids
 * to the page that's open then. Kept per tab, outside any page (as
 * listing-photos' sessionUploads is), so none of the five is dropped. A file
 * no page here noted (a reload in between) still comes back, by id alone.
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
   * through kept (keep) come first: they ride with this batch, so HG still hears of them.
   */
  take(taskId: string, ids: readonly string[]): RecordedUpload[] {
    const job = this.byJob.get(taskId);
    const kept = this.unsent.get(taskId) ?? new Map<string, RecordedUpload>();
    this.unsent.delete(taskId);
    const out = ids.map((id) => job?.get(id) ?? kept.get(id) ?? { id, name: "", kind: null, hasThumb: false, hasPoster: false });
    if (job) {
      for (const id of ids) job.delete(id);
      if (job.size === 0) this.byJob.delete(taskId);
    }
    return [...[...kept.values()].filter((r) => !ids.includes(r.id)), ...out];
  }

  /**
   * A batch whose post didn't go through (no signal, a blip, the job closing under a held photo): its files are on
   * the job already but HG hasn't heard of them, so they wait here, kinds and all, for the next batch this tab
   * posts for the job (take). A reload lets them go; they stay on the job, unposted, as before.
   */
  keep(taskId: string, items: readonly RecordedUpload[]): void {
    if (items.length === 0) return;
    const held = this.unsent.get(taskId) ?? new Map<string, RecordedUpload>();
    for (const item of items) held.set(item.id, item);
    this.unsent.set(taskId, held);
  }
}

/** The one each tab shares: every job page reads and writes this. */
export const recordedUploads = new RecordedUploads();
