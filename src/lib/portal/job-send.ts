import * as core from "@/lib/tasks/core";
import { visitStart } from "@/lib/tasks/media";
import { allOwnPosted, ownPosted, ownUnposted, postBatchIn } from "./job-batch";
import { addMorePhotosLine, finishPhotoCount, finishPhotosNeeded } from "./job-view";

/**
 * A contractor's written update and Mark done on a transaction (portal/jobs.ts
 * runs them in one, as the signed-in contractor), kept apart from the session
 * as job-batch.ts is, so their rules run against a fake transaction
 * (job-batch.test.ts) and a scratch Postgres (job-batch.pg.test.ts). They
 * read here and write only through core.
 */

type Contractor = Extract<core.Principal, { kind: "contractor" }>;

export interface JobUpdateInput {
  body: string;
  /** Files this contractor uploaded to the job and hasn't posted yet. */
  attachmentIds: string[];
  /**
   * The id the browser made for this send. core.addComment answers a second
   * write of the same id by this contractor on this job with the first, so a
   * Retry after a timeout that did post never posts, or emails, twice.
   */
  clientId?: string;
}

/**
 * An update from the composer: text, files, or both. Always Shared (core). Only the contractor's own unposted files go
 * (job-batch.ts ownUnposted). With no text, files that are all posted already (a batch post whose answer was lost put
 * them back on the tray) have nothing new to tell HG: it answers quietly, so the page clears them instead of
 * refusing every Send.
 * A Send again of an update that did post, whose answer was lost, carries its clientId, and addComment answers it
 * with that first post and writes nothing, so the words are on the job once. Photos that landed on the tray since
 * ride with it (composer-draft.ts clientIdToReuse): still unposted once addComment answers, under its task row
 * lock, they go as their own batch post (postBatchIn, the late way on a job HG closed since), so HG hears of them
 * and the page can let them go.
 */
export async function postUpdateIn(tx: core.Tx, taskId: string, p: Contractor, input: JobUpdateInput): Promise<void> {
  const own = await ownUnposted(tx, taskId, p.contactId, input.attachmentIds);
  if (!input.body.trim() && own.length === 0 && (await allOwnPosted(tx, taskId, p.contactId, input.attachmentIds))) {
    await core.assertContractorAccess(tx, taskId, p.contactId);
    return;
  }
  await core.addComment(tx, taskId, { body: input.body, attachmentIds: own.map((f) => f.id), clientId: input.clientId }, p);
  // A new update linked every one of them. Only a first send answered back links none.
  const left = input.clientId && own.length > 0 ? await ownUnposted(tx, taskId, p.contactId, own.map((f) => f.id)) : [];
  if (left.length > 0) await postBatchIn(tx, taskId, p, left.map((f) => f.id));
}

/**
 * Mark done: the job moves to Review (D6b) with the optional note and photos
 * of the finished work as the note core.setStatus writes beside it, tied to
 * the status line (`data.statusEventId`), so Activity shows the two as one
 * decision, as a partner's Send back does (activity 2.2 d). Both partners get
 * one email for the two: the note's line, then "marked it done" (core bundles
 * them). When the job's playbook asks for photos
 * (TaskTemplate.finishPhotosRequired, uploads 2.8), it needs that many of this
 * contractor's own photos and videos here (job-view finishPhotoCount, what the
 * sheet counts): the unposted ones, which this update links, and any a batch
 * post of this visit already told HG of whose answer was lost, which stay on
 * that post's line (job-batch.ts ownPosted; the visit is the Review card's,
 * lib/tasks/media.ts visitStart). Those are named on the move to Review
 * (`finishIds`), so they show under "At finish" with the rest. The sheet holds
 * the button until they are up, and this is the same rule where the browser
 * can't skip it.
 * The task row is taken first, before anything is counted, as every writer on
 * a task takes it: a batch post of the same photos, a staff Remove or a send
 * back that commits while this waits is what it counts, never the files as
 * they were a moment before, so the count it checks is the count it writes.
 * Access is checked next, under that lock (setStatus checks it again).
 */
export async function markDoneIn(tx: core.Tx, taskId: string, p: Contractor, input: JobUpdateInput): Promise<void> {
  await core.lockTask(tx, taskId);
  // Access before anything about the job is read or said, so a contractor taken off it never hears its photo count.
  await core.assertContractorAccess(tx, taskId, p.contactId);
  const own = await ownUnposted(tx, taskId, p.contactId, input.attachmentIds);
  const template = await tx.task.findUnique({ where: { id: taskId }, select: { taskTemplate: { select: { finishPhotosRequired: true } } } });
  const required = finishPhotosNeeded(template?.taskTemplate?.finishPhotosRequired);
  let photos = finishPhotoCount(own.map((f) => f.kind));
  // Photos a batch post of this visit already told HG of, put back on the tray after its answer was lost, count too.
  const posted = photos < required ? await ownPosted(tx, taskId, p.contactId, input.attachmentIds, await visitStartOf(tx, taskId)) : [];
  photos += finishPhotoCount(posted.map((f) => f.kind));
  if (photos < required) {
    throw new core.TaskRuleError(`${addMorePhotosLine(required - photos)} to mark this done.`);
  }
  await core.setStatus(tx, taskId, "REVIEW", p, {
    note: input.body,
    attachmentIds: own.map((f) => f.id),
    finishIds: posted.map((f) => f.id),
  });
}

/** When this visit to the job started: the job's latest move to In progress (visitStart), or null for an older job with none. */
async function visitStartOf(tx: core.Tx, taskId: string): Promise<Date | null> {
  const starts = await tx.taskEvent.findMany({
    where: { taskId, kind: "STATUS", data: { path: ["to"], equals: "IN_PROGRESS" } },
    select: { kind: true, data: true, createdAt: true },
  });
  return visitStart(starts);
}
