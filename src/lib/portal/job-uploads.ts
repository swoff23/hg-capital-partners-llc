import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import * as core from "@/lib/tasks/core";
import { undoWindowOpen } from "./job-view";
import { postBatchIn } from "./job-batch";
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
 * takes back. Returns the update's id for that Undo, and `linked`, the ids of
 * the files it linked (the page counts its toast from these). Two sends of the
 * same photos at once: the one that waited is refused, so it leaves no empty
 * update behind. A send whose photos were all posted already, or taken off the
 * job since (sent again after its answer was lost), answers quietly with no id
 * and nothing linked, so the next piece of a big batch still goes.
 *
 * A job HG has approved or canceled since the photos went up takes no batch
 * post, but the late photos are already recorded on it, so HG hears about
 * them once for the batch: the same line and one email line, which can't be
 * taken back (core.addLateContractorBatch). The job keeps its status, and the
 * answer carries no `eventId` (there is nothing to Undo), so the page says
 * they were added to the job. The job page refreshes, so they show in its
 * photos. The access check still comes first. An approve that lands between
 * this step's status read and addComment's takes the same late way; one that
 * commits while addComment is writing leaves a batch line on the Done job,
 * whose Undo is then refused (job-batch.ts postBatchIn).
 */
export async function postJobBatch(taskId: string, attachmentIds: string[]): Promise<{ eventId: string | null; linked: string[] }> {
  const p = await requirePortalPrincipal();
  const posted = await prisma.$transaction((tx) => postBatchIn(tx, taskId, taskPrincipal(p), attachmentIds));
  revalidateJob(taskId);
  return { eventId: posted.event?.id ?? null, linked: posted.linked };
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
