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

/**
 * Of the ids the browser sent, the files this contractor already posted on this job as a batch post (no text, the
 * "3 photos posted" kind) during this visit, with their kinds: a batch whose answer was lost comes back on the tray.
 * Mark done counts these toward the photos it asks for (portal/jobs.ts), since HG heard of them with that post.
 * `since` is when the visit started (lib/tasks/media.ts visitStart, which the Review card reads too): a batch post
 * from before the job last went to In progress counted for an earlier Mark done, not this one. A photo posted with a
 * written update never counts, as before.
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
      event: { is: { data: { path: ["batch"], equals: true }, ...(since ? { createdAt: { gte: since } } : {}) } },
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
export async function allOwnPosted(tx: core.Tx, taskId: string, contactId: string, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return false;
  const rows = await tx.taskAttachment.findMany({
    where: { id: { in: unique }, taskId },
    select: { uploadedByContactId: true, eventId: true, asanaGid: true },
  });
  return rows.every((f) => f.uploadedByContactId === contactId && f.eventId !== null && f.asanaGid === null);
}

/**
 * The files a post linked: the rows on its event, read in the same transaction. A file another send took between
 * the read of what's unposted and the link isn't among them, so the toast never counts it twice.
 */
async function linkedTo(tx: core.Tx, eventId: string): Promise<string[]> {
  return (await tx.taskAttachment.findMany({ where: { eventId }, select: { id: true } })).map((f) => f.id);
}

/**
 * What a batch post did: its event, for the Undo (null when none is one Undo
 * takes back), and the files it linked, the ones it told HG of. The page
 * words its toast from `linked`, so a file it sent that was posted already
 * (one sent again after its answer was lost) isn't counted twice.
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
 * One batch of recorded files, posted together. The access check comes first.
 * A send whose files are all this contractor's and posted already, or removed
 * from the job since (one sent again after its answer was lost) has nothing new
 * to tell, on a job of any status: it answers quietly, with no event and
 * nothing linked, so the pieces after it still go (record-and-post.ts posts a
 * big batch in pieces and stops at the first refused). Two sends of the same
 * files at once still meet on the files' rows, so the one that waited is
 * refused and leaves nothing.
 * On an active job it is one update with no text, marked as a batch for the
 * Undo (core.addComment `batch`), and its event comes back for that Undo. On
 * a job HG has approved or canceled since the photos went up, the late
 * photos are already recorded on it, so HG hears about them once for the
 * batch, a line and an email line Undo never takes back, and there is no
 * event. HG can approve between the status read here and addComment's own
 * read: addComment then refuses "This job is closed." before it writes
 * anything, so the same files take the late way in this same transaction.
 * An approve that commits after addComment's read, while it is still writing,
 * leaves a batch line on a job that is Done (HG hears once; the toast's Undo
 * is then refused "This job is closed."). Closing that gap takes the task
 * row's lock first, which moves where two sends of the same files wait on
 * each other (job-batch.pg.test.ts), so it is left.
 */
export async function postBatchIn(tx: core.Tx, taskId: string, p: Contractor, attachmentIds: string[]): Promise<BatchPosted> {
  await core.assertContractorAccess(tx, taskId, p.contactId);
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  const own = (await ownUnposted(tx, taskId, p.contactId, attachmentIds)).map((f) => f.id);
  if (own.length === 0 && (await allOwnPosted(tx, taskId, p.contactId, attachmentIds))) return { event: null, linked: [] };
  if (task && !isActiveStatus(task.status)) return postLate(tx, taskId, p, own);
  try {
    const event = await core.addComment(tx, taskId, { body: "", attachmentIds: own, batch: true }, p);
    return { event, linked: await linkedTo(tx, event.id) };
  } catch (err) {
    if (err instanceof core.TaskRuleError && err.message === JOB_CLOSED) return postLate(tx, taskId, p, own);
    throw err;
  }
}
