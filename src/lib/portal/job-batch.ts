import type { AttachmentKind, TaskEvent } from "@prisma/client";
import { JOB_CLOSED } from "@/lib/attachments/access";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";

/**
 * The contractor's batch step on a transaction (docs/specs/uploads-photos.md
 * 2.7 and question 4), kept apart from job-uploads.ts, which reads the
 * session and refreshes the pages, so its rules can be run against a fake
 * transaction (job-batch.test.ts). It reads here and writes only through
 * core: core.addComment for a job still active, core.addLateContractorBatch
 * for one HG approved or canceled.
 */

type Contractor = Extract<core.Principal, { kind: "contractor" }>;

/**
 * Of the ids the browser sent, the files this contractor uploaded to this job
 * through the portal and hasn't posted yet, with their kinds. core.addComment
 * links whatever unposted files it's given and makes them Shared, so nobody
 * else's file can be named here. A file imported from Asana never counts,
 * even one the importer credits to this contractor with no update of its
 * own: it's history, not this visit's work. Mark done counts these
 * (portal/jobs.ts), and so does the batch post below.
 */
export async function ownUnposted(tx: core.Tx, taskId: string, contactId: string, ids: string[]): Promise<{ id: string; kind: AttachmentKind }[]> {
  if (ids.length === 0) return [];
  return tx.taskAttachment.findMany({
    where: { id: { in: ids }, taskId, uploadedByContactId: contactId, eventId: null, deletedAt: null, asanaGid: null },
    select: { id: true, kind: true },
  });
}

/** Whether every id is a file this contractor already posted on this job: a send that came again. */
async function allOwnPosted(tx: core.Tx, taskId: string, contactId: string, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return false;
  const posted = await tx.taskAttachment.count({
    where: { id: { in: unique }, taskId, uploadedByContactId: contactId, eventId: { not: null }, deletedAt: null, asanaGid: null },
  });
  return posted === unique.length;
}

/**
 * Late photos on a job that is no longer active: HG hears once for the batch
 * (core.addLateContractorBatch). A send whose files are all posted already
 * (one sent again after its answer was lost) has nothing new to tell, so it
 * answers as the first did, quietly, instead of "Write something or add a
 * photo.".
 */
async function postLate(tx: core.Tx, taskId: string, p: Contractor, attachmentIds: string[], own: string[]): Promise<null> {
  if (own.length === 0 && (await allOwnPosted(tx, taskId, p.contactId, attachmentIds))) return null;
  await core.addLateContractorBatch(tx, taskId, own, p);
  return null;
}

/**
 * One batch of recorded files, posted together. The access check comes first.
 * On an active job it is one update with no text, marked as a batch for the
 * Undo (core.addComment `batch`), and its event comes back for that Undo. On
 * a job HG has approved or canceled since the photos went up, the late
 * photos are already recorded on it, so HG hears about them once for the
 * batch, a line and an email line Undo never takes back, and the answer is
 * null. HG can approve between the status read here and addComment's own
 * read: addComment then refuses "This job is closed." before it writes
 * anything, so the same files take the late way in this same transaction.
 */
export async function postBatchIn(tx: core.Tx, taskId: string, p: Contractor, attachmentIds: string[]): Promise<TaskEvent | null> {
  await core.assertContractorAccess(tx, taskId, p.contactId);
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  const own = (await ownUnposted(tx, taskId, p.contactId, attachmentIds)).map((f) => f.id);
  if (task && !isActiveStatus(task.status)) return postLate(tx, taskId, p, attachmentIds, own);
  try {
    return await core.addComment(tx, taskId, { body: "", attachmentIds: own, batch: true }, p);
  } catch (err) {
    if (err instanceof core.TaskRuleError && err.message === JOB_CLOSED) return postLate(tx, taskId, p, attachmentIds, own);
    throw err;
  }
}
