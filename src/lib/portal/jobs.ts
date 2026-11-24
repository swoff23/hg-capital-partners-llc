import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { isActiveStatus } from "@/lib/task-scope";
import { queueNoticeNow } from "@/lib/notifications/reminders";
import { scheduledDay } from "@/lib/tasks/rules";
import * as core from "@/lib/tasks/core";
import { recordPortalAttachment } from "@/lib/tasks/service";
import { logSecurityEvent } from "./accounts";
import { crewText } from "./crew-text";
import { jobLinkUrl } from "./job-link-paths";
import { mintJobLink } from "./job-links";
import { markDoneIn, postUpdateIn, type JobUpdateInput } from "./job-send";
import { addressLine } from "./job-view";
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
 * Opening a job leaves its records: everything in it counts as seen for
 * "2 new", and a lockbox code or the tenants on screen are logged (D21,
 * docs/specs/tenant-contact.md Q12). The job page calls this while it
 * renders. A render must never write (Next's data-security guide, "Avoiding
 * side-effects during rendering"), so the request is read here and the writes
 * run in after(), once the page has been sent.
 */
export async function noteJobViewed(taskId: string, opts: { lockboxShown: boolean; tenantShown: boolean }): Promise<void> {
  const p = await requirePortalPrincipal();
  // cookies() and headers() can't be read inside after() from a page.
  const ipHash = opts.lockboxShown || opts.tenantShown ? await requestIpHash() : null;
  const now = new Date();
  after(async () => {
    try {
      await markJobSeen(p, taskId, now);
      if (ipHash && opts.lockboxShown) await logAccessView("LOCKBOX_VIEWED", p, taskId, ipHash, now);
      if (ipHash && opts.tenantShown) await logAccessView("TENANT_VIEWED", p, taskId, ipHash, now);
    } catch (err) {
      logError("portal:job-viewed", err, { taskId });
    }
  });
}

async function markJobSeen(p: PortalPrincipal, taskId: string, now: Date): Promise<void> {
  await core.assertContractorAccess(prisma, taskId, p);
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
 * One LOCKBOX_VIEWED or TENANT_VIEWED SecurityEvent per contractor, job, kind
 * and Buffalo day, counted under a lock so two loads at once still write one.
 */
async function logAccessView(kind: "LOCKBOX_VIEWED" | "TENANT_VIEWED", p: PortalPrincipal, taskId: string, ipHash: string, now: Date): Promise<void> {
  const day = todayYmdEastern(now);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCKBOX_LOCK}::int, hashtext(${`${kind}:${p.contactId}:${taskId}`}))`;
    const seen = await tx.securityEvent.findFirst({
      where: { kind, contactId: p.contactId, taskId, data: { path: ["day"], equals: day } },
      select: { id: true },
    });
    if (!seen) await logSecurityEvent(tx, { kind, contactId: p.contactId, taskId, ipHash, data: { day } });
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

export type { JobUpdateInput } from "./job-send";

/** An update from the composer: text, files, or both, as the signed-in contractor (job-send.ts postUpdateIn has the rules). */
export async function postJobUpdate(taskId: string, input: JobUpdateInput): Promise<void> {
  const p = await requirePortalPrincipal();
  await prisma.$transaction((tx) => postUpdateIn(tx, taskId, taskPrincipal(p), input));
  revalidateJob(taskId);
}

/**
 * Mark done: the job moves to Review with the optional note and photos, as the signed-in contractor
 * (job-send.ts markDoneIn has the rules: the task row first, then the photo count the playbook asks for). A
 * refusal still refreshes the page.
 */
export async function markJobDone(taskId: string, input: JobUpdateInput): Promise<void> {
  const p = await requirePortalPrincipal();
  await refreshOnRefusal(taskId, () => prisma.$transaction((tx) => markDoneIn(tx, taskId, taskPrincipal(p), input)));
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

/**
 * "Share with crew" (docs/specs/contractor-job-emails.md, section 4): the
 * job, where and when, with a CREW link of its own that opens the job as this
 * contractor, lockbox included when their job shows it. Each ask makes a new
 * link. An open job only: a closed one has nothing left to hand on.
 */
export async function crewTextFor(taskId: string): Promise<string> {
  const p = await requirePortalPrincipal();
  await core.assertContractorAccess(prisma, taskId, p);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { title: true, status: true, unitLabel: true, dueDate: true, scheduledFor: true, property: { select: { address: true } } },
  });
  if (!isActiveStatus(task.status)) throw new core.TaskRuleError("This job is closed.");
  const due = toYmd(task.dueDate);
  const scheduled = toYmd(scheduledDay(task));
  const day = (d: string) => fmtDay(d, { weekday: true, year: "auto", now: todayYmdEastern() });
  const token = await mintJobLink(prisma, { taskId, kind: "CREW", contactId: p.contactId });
  return crewText({
    title: task.title,
    where: addressLine(task.property?.address ?? null, task.unitLabel),
    due: due ? day(due) : null,
    scheduled: scheduled ? day(scheduled) : null,
    url: jobLinkUrl(getEnv().appUrl, token),
  });
}

/**
 * The contractor sets or moves their scheduled day (docs/specs/contractor-scheduled-date.md): never the due date,
 * which is HG Capital's. Both partners hear of it (core.ts scheduleByContractor has the rules).
 */
export async function setJobDate(taskId: string, date: string | null): Promise<void> {
  const p = await requirePortalPrincipal();
  await refreshOnRefusal(taskId, () =>
    prisma.$transaction(async (tx) => {
      // Null is Remove day, from Reschedule (Connor, Nov 22): the job asks for a day again, and no heads-up is due.
      if (date === null) {
        await core.unscheduleByContractor(tx, taskId, taskPrincipal(p));
        return;
      }
      const task = await core.scheduleByContractor(tx, taskId, date, taskPrincipal(p));
      // Today or tomorrow at a home that needs notice: the heads-up goes now (Q7).
      await queueNoticeNow(tx, task);
    }),
  );
  revalidateJob(taskId);
}
