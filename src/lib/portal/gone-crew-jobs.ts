import type { GoneCrewJobKind, Prisma, PrismaClient } from "@prisma/client";
import { deleteLeavesCrewNote, deletedJob, goneJobStreet, type GoneJob } from "./gone-job-text";
import { goneCrewJobExpiresAt } from "./limits";
import { hashToken, isWellFormedToken } from "./tokens";

/**
 * A deleted job's note for its crew (docs/specs/emails-redesign.md, Q7). Deleting a task takes its job links and
 * link sessions with it (both cascade), so afterwards a crew member's /j/<token> or open job page would find nothing
 * and go to sign in, as a made-up token does. deleteTask calls keepGoneCrewJob first, in its own transaction, and the
 * crew then reads "This job is canceled. No need to go." with the title and street (gone-job.ts).
 *
 * One GoneCrewJob row per CREW link of the job (keyed by the link's tokenHash) and per crew session still live on it
 * (keyed by the session's tokenHash, the portal cookie's), with only the title and the short street. Nothing for a
 * contractor's own EMAIL link or session: those keep going to sign in. A row is read only by someone holding that
 * token, so it tells nobody anything their link didn't already show them.
 *
 * Kept 30 days, or until the session would have ended if sooner (limits.ts goneCrewJobExpiresAt). Reads skip expired
 * rows, so a note stops counting on time; the next delete that writes notes purges them. Not `server-only`, so
 * gone-crew-jobs.pg.test.ts runs it on a scratch database.
 */

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Inside deleteTask's transaction, before the delete: a note for each of the job's crew links and live crew sessions.
 * Only for a job whose crew may still be on the way (gone-job-text.ts deleteLeavesCrewNote): open, or canceled.
 * Returns how many rows it wrote.
 */
export async function keepGoneCrewJob(tx: Prisma.TransactionClient, taskId: string, now: Date = new Date()): Promise<number> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true, title: true, unitLabel: true, property: { select: { address: true } } },
  });
  if (!task || !deleteLeavesCrewNote(task.status)) return 0;
  const [links, sessions] = await Promise.all([
    // Revoked ones too: a revoked crew link on a canceled job already reads as canceled (gone-job.ts).
    tx.jobLink.findMany({ where: { taskId, kind: "CREW" }, select: { tokenHash: true } }),
    tx.portalSession.findMany({
      where: { onlyTaskId: taskId, jobLink: { kind: "CREW" }, revokedAt: null, expiresAt: { gt: now } },
      select: { tokenHash: true, expiresAt: true },
    }),
  ]);
  const words = { title: task.title, street: goneJobStreet(task.property?.address ?? null, task.unitLabel), deletedAt: now };
  const data: Prisma.GoneCrewJobCreateManyInput[] = [
    ...links.map((l) => ({ ...words, tokenHash: l.tokenHash, kind: "LINK" as const, expiresAt: goneCrewJobExpiresAt(now) })),
    ...sessions.map((s) => ({ ...words, tokenHash: s.tokenHash, kind: "SESSION" as const, expiresAt: goneCrewJobExpiresAt(now, s.expiresAt) })),
  ];
  // A job no crew ever opened writes nothing at all.
  if (data.length === 0) return 0;
  await tx.goneCrewJob.deleteMany({ where: { expiresAt: { lte: now } } });
  const { count } = await tx.goneCrewJob.createMany({ data, skipDuplicates: true });
  return count;
}

/**
 * The words for a deleted job, for the one holding `token`: a crew link's (`LINK`) or a crew session cookie's
 * (`SESSION`). Null for anything else: a malformed or unknown token, the other kind, or a note past its time.
 */
export async function findGoneCrewJob(db: Db, kind: GoneCrewJobKind, token: unknown, now: Date = new Date()): Promise<GoneJob | null> {
  if (!isWellFormedToken(token)) return null;
  const note = await db.goneCrewJob.findFirst({
    where: { tokenHash: hashToken(token), kind, expiresAt: { gt: now } },
    select: { title: true, street: true },
  });
  return note ? deletedJob(note) : null;
}
