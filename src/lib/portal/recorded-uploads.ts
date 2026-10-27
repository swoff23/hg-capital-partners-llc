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

  note(taskId: string, upload: RecordedUpload): void {
    const job = this.byJob.get(taskId) ?? new Map<string, RecordedUpload>();
    job.set(upload.id, upload);
    this.byJob.set(taskId, job);
  }

  /** The files for these ids, in their order, each let go of here once handed over. */
  take(taskId: string, ids: readonly string[]): RecordedUpload[] {
    const job = this.byJob.get(taskId);
    const out = ids.map((id) => job?.get(id) ?? { id, name: "", kind: null, hasThumb: false, hasPoster: false });
    if (job) {
      for (const id of ids) job.delete(id);
      if (job.size === 0) this.byJob.delete(taskId);
    }
    return out;
  }
}

/** The one each tab shares: every job page reads and writes this. */
export const recordedUploads = new RecordedUploads();
