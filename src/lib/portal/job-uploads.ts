import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";
import { undoWindowOpen } from "./job-view";
import { ownUnposted } from "./jobs";
import { requirePortalPrincipal, taskPrincipal } from "./session";

/**
 * A contractor's file posts from the job page (docs/specs/uploads-photos.md
 * 2.7 and question 5): a batch of photos posted as one update, and taking
 * that update back in the seconds after. Jobs.ts holds the rest of what a
 * contractor writes (updates with text, Start job, Mark done, and the record
 * step for each upload).
 *
 * Like jobs.ts, each exported function reads the signed-in contractor itself
 * with requirePortalPrincipal(), so none can be handed someone else's
 * identity, and every task write goes through src/lib/tasks/core.ts as
 * taskPrincipal(principal), which checks access and the job's state.
 */

function revalidateJob(taskId: string): void {
  revalidatePath(`/p/jobs/${taskId}`);
  revalidatePath("/p");
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * The files of one batch, posted together as one update with no text: "Zack
 * added 4 photos" on the timeline and one line in the partners' email. It's
 * marked as a batch (core.addComment `batch`), the only kind of post Undo
 * takes back. Returns the update's id for that Undo. A batch that was already
 * posted (two sends of the same photos at once) is refused, so the losing
 * side leaves no empty update behind.
 *
 * A job HG has approved since the photos went up (Done) takes no more
 * updates, but the late photos are already recorded on it: they stay on the
 * job as they are, with no update and no email, and the answer carries no
 * `eventId` (there is nothing to Undo). The page then says they were added
 * to the job. The job page refreshes, so they show in its photos.
 */
export async function postJobBatch(taskId: string, attachmentIds: string[]): Promise<{ eventId: string | null }> {
  const p = await requirePortalPrincipal();
  const event = await prisma.$transaction(async (tx) => {
    await core.assertContractorAccess(tx, taskId, p.contactId);
    const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (task && !isActiveStatus(task.status)) return null;
    const own = await ownUnposted(tx, taskId, p.contactId, attachmentIds);
    return core.addComment(tx, taskId, { body: "", attachmentIds: own.map((f) => f.id), batch: true }, taskPrincipal(p));
  });
  revalidateJob(taskId);
  return { eventId: event?.id ?? null };
}

/**
 * Takes a batch post back within `undoWindowOpen` of when it posted: the
 * update and its files are soft-deleted and its line leaves the unsent email
 * (core.takeBackContractorPost, which holds every rule). Contractors only
 * ever soft-delete, and this is their only delete.
 */
export async function undoJobPost(taskId: string, eventId: string, now = new Date()): Promise<void> {
  const p = await requirePortalPrincipal();
  await prisma.$transaction((tx) =>
    core.takeBackContractorPost(tx, taskId, eventId, taskPrincipal(p), { undoable: (postedAt) => undoWindowOpen(postedAt, now) }, now),
  );
  revalidateJob(taskId);
}
