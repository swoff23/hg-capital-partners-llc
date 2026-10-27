import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as core from "@/lib/tasks/core";
import { undoWindowOpen } from "./job-view";
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
 * identity, and task writes go through src/lib/tasks/core.ts as
 * taskPrincipal(principal), which checks access and the job's state.
 */

function revalidateJob(taskId: string): void {
  revalidatePath(`/p/jobs/${taskId}`);
  revalidatePath("/p");
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Of the ids the browser sent, the ones this contractor uploaded to this job
 * and hasn't posted yet. core.addComment links whatever unposted files it's
 * given and makes them Shared, so nobody else's file can be named here.
 */
async function ownUnposted(tx: core.Tx, taskId: string, contactId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx.taskAttachment.findMany({
    where: { id: { in: ids }, taskId, uploadedByContactId: contactId, eventId: null, deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * The files of one batch, posted together as one update with no text: "Zack
 * added 4 photos" on the timeline and one line in the partners' email. Returns
 * the update's id for the Undo that follows. A batch that was already posted
 * (two sends of the same photos at once) is refused, so the losing side leaves
 * no empty update behind.
 */
export async function postJobBatch(taskId: string, attachmentIds: string[]): Promise<{ eventId: string }> {
  const p = await requirePortalPrincipal();
  const event = await prisma.$transaction(async (tx) => {
    const ids = await ownUnposted(tx, taskId, p.contactId, attachmentIds);
    return core.addComment(tx, taskId, { body: "", attachmentIds: ids }, taskPrincipal(p));
  });
  revalidateJob(taskId);
  return { eventId: event.id };
}

/** How far an outbox item's own time may sit from its update's and still be that update's line (the two are stamped a moment apart). */
const POST_ITEM_SLACK_MS = 5_000;

/**
 * Takes the post's line out of the partners' unsent email bundle
 * (NotificationOutbox.items), so the email never says "Zack added files" for
 * an update that is gone. The line is the one core.addComment queued for a
 * post with no text: kind COMMENT, this contractor's label, "added files
 * (+N files)" for the N files it linked, stamped at the post's own time. Only
 * the one nearest the post goes, so a second post of the same size a moment
 * later keeps its line. One statement, so an item another writer appends to
 * the same bundle at the same moment is never lost; a bundle left with no
 * items is deleted. A bundle already sent can't be called back.
 */
async function dropPostFromEmailBundle(tx: core.Tx, taskId: string, label: string, postedAt: Date, files: number): Promise<void> {
  // core.addComment's own words for a post with no text: "added files (+3 files)".
  const summary = `added files (+${files} file${files > 1 ? "s" : ""})`;
  const at = postedAt.toISOString();
  const from = new Date(postedAt.getTime() - POST_ITEM_SLACK_MS).toISOString();
  const to = new Date(postedAt.getTime() + POST_ITEM_SLACK_MS).toISOString();
  await tx.$executeRaw(Prisma.sql`
    UPDATE "NotificationOutbox" AS o
    SET "items" = COALESCE((
      SELECT jsonb_agg(e.item ORDER BY e.n)
      FROM jsonb_array_elements(o."items") WITH ORDINALITY AS e(item, n)
      WHERE e.n IS DISTINCT FROM (
        SELECT m.n
        FROM jsonb_array_elements(o."items") WITH ORDINALITY AS m(item, n)
        WHERE m.item->>'kind' = 'COMMENT'
          AND m.item->>'actorLabel' = ${label}
          AND m.item->>'summary' = ${summary}
          AND (m.item->>'at')::timestamptz BETWEEN ${from}::timestamptz AND ${to}::timestamptz
        ORDER BY abs(extract(epoch FROM ((m.item->>'at')::timestamptz - ${at}::timestamptz))), m.n
        LIMIT 1
      )
    ), '[]'::jsonb)
    WHERE o."taskId" = ${taskId} AND o."sentAt" IS NULL`);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "NotificationOutbox"
    WHERE "taskId" = ${taskId} AND "sentAt" IS NULL AND jsonb_array_length("items") = 0`);
}

/**
 * Takes a batch post back: the update and its files are soft-deleted, so they
 * leave the timeline, the grids and the "2 new" counts, and its line leaves
 * the unsent email bundle (dropPostFromEmailBundle). Contractors only ever
 * soft-delete, and this is their only delete: it takes only their own post,
 * one with files and no text (a written update isn't a batch), and only within
 * `undoWindowOpen` of when it posted.
 */
export async function undoJobPost(taskId: string, eventId: string, now = new Date()): Promise<void> {
  const p = await requirePortalPrincipal();
  await prisma.$transaction(async (tx) => {
    await core.assertContractorAccess(tx, taskId, p.contactId);
    const event = await tx.taskEvent.findFirst({
      where: { id: eventId, taskId, kind: "COMMENT", actorContactId: p.contactId, deletedAt: null, body: null },
      select: { createdAt: true },
    });
    if (!event) throw new core.TaskRuleError("That update is already gone.");
    if (!undoWindowOpen(event.createdAt, now)) throw new core.TaskRuleError("It's too late to take that back.");
    await tx.taskEvent.update({ where: { id: eventId }, data: { deletedAt: now } });
    const { count } = await tx.taskAttachment.updateMany({
      where: { eventId, taskId, uploadedByContactId: p.contactId, deletedAt: null },
      data: { deletedAt: now },
    });
    if (count > 0) await dropPostFromEmailBundle(tx, taskId, taskPrincipal(p).label, event.createdAt, count);
  });
  revalidateJob(taskId);
}
