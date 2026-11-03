import type { AttachmentKind, TaskEvent } from "@prisma/client";
import { JOB_CLOSED } from "@/lib/attachments/access";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";

/**
 * The contractor's batch step on a transaction (docs/specs/uploads-photos.md
 * 2.7 and question 4), kept apart from job-uploads.ts, which reads the
 * session and refreshes the pages, so its rules run against a fake
 * transaction (job-batch.test.ts). It reads here and writes only through
 * core: core.addComment for a job still active, core.addLateContractorBatch
 * for one HG approved or canceled.
 */

type Contractor = Extract<core.Principal, { kind: "contractor" }>;

/**
 * Of the ids the browser sent, the files this contractor uploaded to this job
 * through the portal and hasn't posted yet, with their kinds. Core links
 * whatever unposted files it's given (an update through addComment, Mark
 * done's note through setStatus) and makes them Shared, so nobody else's file
 * can be named here. A file imported from Asana never counts, even one the
 * importer credits to this contractor with no update of its own: it's
 * history, not this visit's work. Mark done and a written update
 * (portal/jobs.ts) and the batch post below all use this one.
 */
export async function ownUnposted(tx: core.Tx, taskId: string, contactId: string, ids: string[]): Promise<{ id: string; kind: AttachmentKind }[]> {
  if (ids.length === 0) return [];
  return tx.taskAttachment.findMany({
    where: { id: { in: ids }, taskId, uploadedByContactId: contactId, eventId: null, deletedAt: null, asanaGid: null },
    select: { id: true, kind: true },
  });
}

/**
 * Of the ids the browser sent, the files this contractor already posted on this job as a batch post (no text, the
 * "3 photos posted" kind) during this visit, with their kinds: a batch whose answer was lost comes back on the tray.
 * Mark done counts these toward the photos it asks for (portal/jobs.ts), since HG heard of them with that post.
 * `since` is when the visit started (lib/tasks/media.ts visitStart, which the Review card reads too): a batch post
 * from before the job last went to In progress counted for an earlier Mark done, not this one. It bounds the file's
 * own row, as the Review card does, so a photo recorded before the visit but posted in it is left out of both. A
 * photo posted with a written update never counts, as before.
 */
export async function ownPosted(
  tx: core.Tx,
  taskId: string,
  contactId: string,
  ids: string[],
  since: Date | null,
): Promise<{ id: string; kind: AttachmentKind }[]> {
  if (ids.length === 0) return [];
  return tx.taskAttachment.findMany({
    where: {
      id: { in: ids },
      taskId,
      uploadedByContactId: contactId,
      eventId: { not: null },
      // The file's own row, as the Review card bounds it (media.ts reviewPhotos): a post is never older than its files.
      ...(since ? { createdAt: { gte: since } } : {}),
      event: { is: { data: { path: ["batch"], equals: true } } },
      deletedAt: null,
      asanaGid: null,
    },
    select: { id: true, kind: true },
  });
}

/**
 * Whether every id is a file of this contractor's on this job with nothing left to tell HG: posted already (one Undo
 * took back since keeps its post), or gone from the job (staff Remove deletes the row, so an id with no row on this
 * job counts as removed). A send that came again, after its answer was lost, answers quietly on this. Any other row
 * (someone else's, unposted, imported) means there is something to refuse.
 */
export async function allOwnPosted(tx: core.Tx, taskId: string, contactId: string, ids: readonly string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return false;
  const rows = await tx.taskAttachment.findMany({
    where: { id: { in: unique }, taskId },
    select: { uploadedByContactId: true, eventId: true, asanaGid: true },
  });
  return rows.every((f) => f.uploadedByContactId === contactId && f.eventId !== null && f.asanaGid === null);
}

/**
 * Thrown by postBatchIn when it lost a race to the same photos: both sends read them as unposted, and the one that
 * waited on the task row found the other had linked them. Thrown, not returned, so the update addComment began
 * rolls back with its transaction; postJobBatch answers it quietly.
 */
export class BatchAlreadyPosted extends Error {
  constructor() {
    super("Those photos are posted already.");
    this.name = "BatchAlreadyPosted";
  }
}

/**
 * The files a post linked: the rows on its event, read in the same transaction. A file another send took between
 * the read of what's unposted and the link isn't among them, so the toast never counts it twice.
 */
async function linkedTo(tx: core.Tx, eventId: string): Promise<string[]> {
  return (await tx.taskAttachment.findMany({ where: { eventId }, select: { id: true } })).map((f) => f.id);
}

/**
 * What a batch post did: its event, for the Undo (null when there is none
 * Undo takes back: a late line, or nothing new to tell), and the files it
 * linked, the ones it told HG of. The page words its toast from `linked`, so
 * a file it sent that was posted already (one sent again after its answer was
 * lost) isn't counted twice, and a send with nothing linked says nothing.
 */
export interface BatchPosted {
  event: TaskEvent | null;
  linked: string[];
}

/**
 * Late photos on a job that is no longer active: HG hears once for the batch
 * (core.addLateContractorBatch). Its event is a line Undo never takes back,
 * so the answer carries none; the event is kept only to read what it linked.
 */
async function postLate(tx: core.Tx, taskId: string, p: Contractor, own: string[]): Promise<BatchPosted> {
  const event = await core.addLateContractorBatch(tx, taskId, own, p);
  return { event: null, linked: await linkedTo(tx, event.id) };
}

/**
 * The batch on a job active or not: one undoable batch post through
 * addComment, or HG's late line once the job is approved or canceled. An
 * approve that landed before addComment took the task row is refused there
 * under its lock with "This job is closed." before anything is written, so
 * the same files take the late way in this same transaction. A reopen that
 * landed before addLateContractorBatch took the task row is the same the
 * other way round: refused there under its lock (core.JOB_OPEN_AGAIN), the
 * files post as the undoable batch. addComment and addLateContractorBatch
 * both take the task row before they read the job, so an approve or a reopen
 * can't commit while either is writing, and the second try reads what the
 * first read under the same lock.
 */
async function postOwn(tx: core.Tx, taskId: string, p: Contractor, own: string[], active: boolean): Promise<BatchPosted> {
  if (!active) {
    try {
      return await postLate(tx, taskId, p, own);
    } catch (err) {
      if (err instanceof core.TaskRuleError && err.message === core.JOB_OPEN_AGAIN) return postActive(tx, taskId, p, own);
      throw err;
    }
  }
  try {
    return await postActive(tx, taskId, p, own);
  } catch (err) {
    if (err instanceof core.TaskRuleError && err.message === JOB_CLOSED) return postLate(tx, taskId, p, own);
    throw err;
  }
}

/** The undoable batch post on an active job: one update with no text, marked as a batch (core.addComment `batch`). */
async function postActive(tx: core.Tx, taskId: string, p: Contractor, own: string[]): Promise<BatchPosted> {
  const event = await core.addComment(tx, taskId, { body: "", attachmentIds: own, batch: true }, p);
  return { event, linked: await linkedTo(tx, event.id) };
}

/**
 * One batch of recorded files, posted together. The access check comes first.
 * A send whose files are all this contractor's and posted already, or removed
 * from the job since (one sent again after its answer was lost) has nothing new
 * to tell, on a job of any status: it answers quietly, with no event and
 * nothing linked, so the pieces after it still go (record-and-post.ts posts a
 * big batch in pieces and stops at the first refused).
 * On an active job it is one update with no text, marked as a batch for the
 * Undo (core.addComment `batch`), and its event comes back for that Undo. On
 * a job HG has approved or canceled since the photos went up, the late
 * photos are already recorded on it, so HG hears about them once for the
 * batch, a line and an email line Undo never takes back, and there is no
 * event (postOwn has the approve in between).
 * Two sends of the same photos at once both read them as unposted; the one
 * that waited on the task row finds the other linked them, so core refuses
 * an update with no words and no photos. That is BatchAlreadyPosted, thrown
 * so its own update rolls back, and postJobBatch answers it quietly.
 */
export async function postBatchIn(tx: core.Tx, taskId: string, p: Contractor, attachmentIds: string[]): Promise<BatchPosted> {
  await core.assertContractorAccess(tx, taskId, p.contactId);
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  const own = (await ownUnposted(tx, taskId, p.contactId, attachmentIds)).map((f) => f.id);
  if (own.length === 0 && (await allOwnPosted(tx, taskId, p.contactId, attachmentIds))) return { event: null, linked: [] };
  try {
    return await postOwn(tx, taskId, p, own, !task || isActiveStatus(task.status));
  } catch (err) {
    if (!(err instanceof core.TaskRuleError)) throw err;
    // The other send linked them while this one waited on the task row: nothing was lost, so nothing to say.
    if (own.length > 0 && (await allOwnPosted(tx, taskId, p.contactId, own))) throw new BatchAlreadyPosted();
    throw err;
  }
}
