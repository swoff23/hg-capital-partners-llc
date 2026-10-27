import type { AttachmentKind, TaskEvent } from "@prisma/client";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";

/**
 * The contractor's batch step on a transaction (docs/specs/uploads-photos.md
 * 2.7), kept apart from job-uploads.ts, which reads the session and refreshes
 * the pages, so its rules run against a fake transaction (job-batch.test.ts).
 * It reads here and writes only through core.addComment.
 */

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
 * Whether every id is a file of this contractor's on this job that is posted already (an Undo since keeps its
 * post), or gone from the job (staff Remove deletes the row): the same photos sent again, from a second tab or
 * after an answer that never arrived, have nothing new to tell HG. Any other row (someone else's, unposted,
 * imported) means there is something to refuse.
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

/** core.addComment's refusal of a contractor's post on a job that is no longer active. */
export const JOB_CLOSED = "This job is closed.";

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
 * What a batch post did: its update, for the Undo (null when there is none: the job closed meanwhile, or the
 * photos were posted already), and whether they were posted already, so the page says nothing.
 */
export interface BatchPosted {
  event: TaskEvent | null;
  alreadyPosted: boolean;
}

/**
 * One batch of recorded files, posted together as one update with no text, marked as a batch for the Undo
 * (core.addComment `batch`). The access check comes first. A job HG has approved since the photos went up takes
 * no update: the photos stay on the job as they are, and there is no event. So does one that waited on the task
 * row behind Approve and found it Done under addComment's lock (core refuses before it writes). Photos that are
 * all posted already (sent again) answer quietly with nothing written, and so does the losing side of two sends
 * of the same photos at once, by BatchAlreadyPosted, which rolls its own update back.
 */
export async function postBatchIn(tx: core.Tx, taskId: string, p: core.Principal, attachmentIds: string[]): Promise<BatchPosted> {
  if (p.kind !== "contractor") throw new core.TaskRuleError("Only a contractor's photos post as a batch.");
  await core.assertContractorAccess(tx, taskId, p.contactId);
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (task && !isActiveStatus(task.status)) return { event: null, alreadyPosted: false };
  const own = (await ownUnposted(tx, taskId, p.contactId, attachmentIds)).map((f) => f.id);
  if (own.length === 0 && (await allOwnPosted(tx, taskId, p.contactId, attachmentIds))) return { event: null, alreadyPosted: true };
  try {
    return { event: await core.addComment(tx, taskId, { body: "", attachmentIds: own, batch: true }, p), alreadyPosted: false };
  } catch (err) {
    if (!(err instanceof core.TaskRuleError)) throw err;
    if (err.message === JOB_CLOSED) return { event: null, alreadyPosted: false };
    // The other send linked them while this one waited on the task row: nothing was lost, so nothing to say.
    if (own.length > 0 && (await allOwnPosted(tx, taskId, p.contactId, own))) throw new BatchAlreadyPosted();
    throw err;
  }
}
