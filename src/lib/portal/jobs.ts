import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayYmdEastern } from "@/lib/dates";
import { logError } from "@/lib/log";
import * as core from "@/lib/tasks/core";
import { recordPortalAttachment } from "@/lib/tasks/service";
import { logSecurityEvent } from "./accounts";
import { addMorePhotosLine, finishPhotosNeeded } from "./job-view";
import { requestIpHash } from "./request";
import { requirePortalPrincipal, taskPrincipal, type PortalPrincipal } from "./session";

/**
 * Everything a contractor writes from their job page (docs/asana-migration-plan.md
 * §6, Job page): updates, Start job, Mark done, checklist ticks and uploads,
 * plus the two records opening a job leaves (read state, lockbox view).
 *
 * Each exported function reads the signed-in contractor itself with
 * requirePortalPrincipal() (cached per request), so none can be handed
 * someone else's identity. Task writes go through src/lib/tasks/core.ts as
 * taskPrincipal(principal), which checks access, the job's state and the
 * contractor's two buttons, and queues the emails to both partners. Uploads
 * are recorded by tasks/service.ts recordPortalAttachment, which verifies the
 * blob itself.
 */

/** Advisory-lock namespace for the once-a-day lockbox log (reset.ts uses 7301 and 7302). */
const LOCKBOX_LOCK = 7303;

function revalidateJob(taskId: string): void {
  revalidatePath(`/p/jobs/${taskId}`);
  revalidatePath("/p");
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Opening a job leaves two records: everything in it counts as seen for
 * "2 new", and a lockbox code on screen is logged (D21). The job page calls
 * this while it renders. A render must never write (Next's data-security
 * guide, "Avoiding side-effects during rendering"), so the request is read
 * here and the writes run in after(), once the page has been sent.
 */
export async function noteJobViewed(taskId: string, opts: { lockboxShown: boolean }): Promise<void> {
  const p = await requirePortalPrincipal();
  // cookies() and headers() can't be read inside after() from a page.
  const ipHash = opts.lockboxShown ? await requestIpHash() : null;
  const now = new Date();
  after(async () => {
    try {
      await markJobSeen(p, taskId, now);
      if (ipHash) await logLockboxView(p, taskId, ipHash, now);
    } catch (err) {
      logError("portal:job-viewed", err, { taskId });
    }
  });
}

async function markJobSeen(p: PortalPrincipal, taskId: string, now: Date): Promise<void> {
  await core.assertContractorAccess(prisma, taskId, p.contactId);
  try {
    await prisma.taskReadState.upsert({
      where: { taskId_contactId: { taskId, contactId: p.contactId } },
      create: { taskId, contactId: p.contactId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
  } catch (err) {
    // Two tabs opening the job at once: the other one wrote the same row.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

/**
 * One LOCKBOX_VIEWED SecurityEvent per contractor, job and Buffalo day,
 * counted under a lock so two loads at once still write one.
 */
async function logLockboxView(p: PortalPrincipal, taskId: string, ipHash: string, now: Date): Promise<void> {
  const day = todayYmdEastern(now);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCKBOX_LOCK}::int, hashtext(${`${p.contactId}:${taskId}`}))`;
    const seen = await tx.securityEvent.findFirst({
      where: { kind: "LOCKBOX_VIEWED", contactId: p.contactId, taskId, data: { path: ["day"], equals: day } },
      select: { id: true },
    });
    if (!seen) await logSecurityEvent(tx, { kind: "LOCKBOX_VIEWED", contactId: p.contactId, taskId, ipHash, data: { day } });
  });
}

/** Start job: To do, Scheduled or Waiting becomes In progress. */
export async function startJob(taskId: string): Promise<void> {
  const p = await requirePortalPrincipal();
  await refreshOnRefusal(taskId, () => prisma.$transaction((tx) => core.setStatus(tx, taskId, "IN_PROGRESS", taskPrincipal(p))));
  revalidateJob(taskId);
}

/** A refused change (the job moved on, or closed) still refreshes the page, so it shows where the job is now. */
async function refreshOnRefusal<T>(taskId: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateJob(taskId);
    throw err;
  }
}

export interface JobUpdateInput {
  body: string;
  /** Files this contractor uploaded to the job and hasn't posted yet. */
  attachmentIds: string[];
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

/** An update from the composer: text, files, or both. Always Shared (core). */
export async function postJobUpdate(taskId: string, input: JobUpdateInput): Promise<void> {
  const p = await requirePortalPrincipal();
  await prisma.$transaction(async (tx) => {
    const attachmentIds = await ownUnposted(tx, taskId, p.contactId, input.attachmentIds);
    await core.addComment(tx, taskId, { body: input.body, attachmentIds }, taskPrincipal(p));
  });
  revalidateJob(taskId);
}

/**
 * Mark done: the optional note and photos of the finished work go up as one
 * update, then the job moves to Review (D6b). Both partners get one email
 * for the two (core bundles them). When the job's playbook asks for photos
 * (TaskTemplate.finishPhotosRequired, uploads 2.8), it needs that many of this
 * contractor's own, unposted files here; the sheet holds the button until they
 * are up, and this is the same rule where the browser can't skip it.
 */
export async function markJobDone(taskId: string, input: JobUpdateInput): Promise<void> {
  const p = await requirePortalPrincipal();
  const principal = taskPrincipal(p);
  await refreshOnRefusal(taskId, () =>
    prisma.$transaction(async (tx) => {
      const attachmentIds = await ownUnposted(tx, taskId, p.contactId, input.attachmentIds);
      const template = await tx.task.findUnique({ where: { id: taskId }, select: { taskTemplate: { select: { finishPhotosRequired: true } } } });
      const required = finishPhotosNeeded(template?.taskTemplate?.finishPhotosRequired);
      if (attachmentIds.length < required) {
        throw new core.TaskRuleError(`${addMorePhotosLine(required - attachmentIds.length)} to mark this done.`);
      }
      if (input.body.trim() || attachmentIds.length) {
        await core.addComment(tx, taskId, { body: input.body, attachmentIds }, principal);
      }
      await core.setStatus(tx, taskId, "REVIEW", principal);
    }),
  );
  revalidateJob(taskId);
}

/** Tick or untick a checklist item on an active job. */
export async function setJobChecklistItem(itemId: string, done: boolean): Promise<void> {
  const p = await requirePortalPrincipal();
  const item = await prisma.$transaction((tx) => core.setChecklistItem(tx, itemId, done, taskPrincipal(p)));
  revalidateJob(item.taskId);
}

export type JobUpload = Parameters<typeof recordPortalAttachment>[1];

/**
 * The record step after a browser upload to /api/blob/portal-task-upload.
 * Not posted yet: it joins the next update (postJobUpdate or markJobDone),
 * which refreshes the page, so nothing is revalidated here.
 */
export async function recordJobUpload(taskId: string, file: JobUpload): Promise<{ id: string }> {
  const p = await requirePortalPrincipal();
  return recordPortalAttachment(taskId, file, p, { standalone: false });
}
