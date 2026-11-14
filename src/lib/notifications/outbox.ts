import "server-only";
import { prisma } from "@/lib/db";
import { renderJobEmail } from "@/lib/email/render";
import { todayYmdEastern, toYmd } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { SEEABLE_FILE, contractorMaySee } from "@/lib/attachments/access";
import { CODE_MASK, lockboxMasker, readLockboxCode } from "@/lib/portal/access-code";
import { mintJobLink } from "@/lib/portal/job-links";
import { staffFirstNames } from "@/lib/portal/queries";
import { targetDate } from "@/lib/tasks/rules";
import {
  DAILY_EMAIL_CAP,
  deliveryFor,
  easternDayStart,
  parseItems,
  reachedCapNow,
  reconcileItems,
  refusedRetryAt,
  retryAt,
  sendBudget,
  sendFailureKind,
  taskEmail,
  type EventSnapshot,
  type OutboxItem,
} from "./content";
import { sentSince } from "./sent-count";

/**
 * Sends the task emails src/lib/tasks/core.ts queues in NotificationOutbox
 * (docs/asana-migration-plan.md §5.4). Run once a minute by
 * /api/cron/notifications.
 *
 * Each due row becomes one email. A row is claimed before it's sent, in one
 * statement that also clears its openKey, so what's sent is exactly what the
 * row held at that moment: a change queued after the claim starts a new row
 * (and a new email) instead of being lost, and two drains running at once
 * never send the same row twice. The claim pushes sendAfter out by a lease,
 * so a run that dies mid-send is retried later rather than never.
 *
 * Failures retry with backoff (content.ts retryAt) and give up after the
 * fifth try. At most DAILY_EMAIL_CAP emails go out per Buffalo day (D30);
 * past that, rows wait for tomorrow and the crossing is logged once. When
 * Resend itself refuses for its quota or rate limit, the try is given back
 * and the run stops, so a busy day holds emails instead of losing them.
 * Sends are spaced to stay under Resend's per-second limit.
 */

const BATCH = 50;
const LEASE_MS = 5 * 60_000;
/** Stop starting new sends after this long, inside the route's 60s limit. */
const TIME_BUDGET_MS = 45_000;
/** At least this long between sends: Resend's default limit is 2 requests a second. */
const SEND_GAP_MS = 600;

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Rows left for tomorrow by the daily cap. */
  held: number;
}

/**
 * Emails sent since midnight in Buffalo (sent-count.ts sentSince, which
 * Home's banner counts with too): outbox rows sent with no error, plus
 * password-reset emails that went.
 */
export async function sentTodayCount(now = new Date()): Promise<number> {
  return sentSince(prisma, easternDayStart(now));
}

/** Close a row without sending: no login, no access, no recipient, no task. */
async function closeUnsent(id: string, now: Date, reason: string): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: now, lastError: reason, openKey: null },
  });
}

/**
 * Take the row for this run. Null when another run has it or it was already
 * sent. The columns are UTC timestamps without a zone (as Prisma writes
 * them), so instants are converted explicitly: a raw Date parameter would
 * otherwise be read in the session's time zone, which is local time on a
 * developer's Postgres.
 */
async function claim(id: string, now: Date): Promise<{ items: unknown; attempts: number } | null> {
  const lease = new Date(now.getTime() + LEASE_MS).toISOString();
  const rows = await prisma.$queryRaw<{ items: unknown; attempts: number }[]>`
    UPDATE "NotificationOutbox"
    SET "openKey" = NULL, "attempts" = "attempts" + 1, "sendAfter" = (${lease}::timestamptz AT TIME ZONE 'UTC')
    WHERE "id" = ${id} AND "sentAt" IS NULL AND "sendAfter" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    RETURNING "items", "attempts"`;
  return rows[0] ?? null;
}

/**
 * Resend refused for its quota: every row still due waits until `until`.
 * Locked in id order and SKIP LOCKED, so it never waits on a row a write in
 * core.ts holds, and never holds one that write then waits for.
 */
async function pushBackDue(now: Date, until: Date): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "NotificationOutbox" SET "sendAfter" = (${until.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    WHERE "id" IN (
      SELECT "id" FROM "NotificationOutbox"
      WHERE "sentAt" IS NULL AND "sendAfter" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      ORDER BY "id"
      FOR UPDATE SKIP LOCKED
    )`;
}

/**
 * The claimed row's items as they stand now (activity 2.5): each item that
 * names an event (a comment, a status, a file post, a send-back's note) is
 * read back, in one query scoped to the row's task, and content.ts
 * reconcileItems drops what was deleted and re-renders what was edited. The
 * read is after the claim, so what is sent is what is true as it goes. Items
 * queued before they named events send as stored, and a row can mix both.
 */
async function liveItems(
  taskId: string,
  stored: OutboxItem[],
  row: { audience: "staff" | "contractor"; recipientContactId: string | null },
): Promise<{ items: OutboxItem[]; photosByEvent: Map<string, string[]> }> {
  const ids = [...new Set(stored.flatMap((i) => [i.eventId, i.noteEventId].filter((x): x is string => !!x)))];
  if (ids.length === 0) return { items: stored, photosByEvent: new Map() };
  const found = await prisma.taskEvent.findMany({
    where: { id: { in: ids }, taskId },
    select: {
      id: true,
      visibility: true,
      deletedAt: true,
      body: true,
      audienceContactId: true,
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { ...SEEABLE_FILE, id: true, thumbPathname: true } },
    },
  });
  const events = new Map<string, EventSnapshot>(
    found.map((e) => [
      e.id,
      {
        id: e.id,
        visibility: e.visibility,
        deletedAt: e.deletedAt,
        body: e.body,
        audienceContactId: e.audienceContactId,
        files: e.attachments.map((a) => (a.kind === "IMAGE" ? "image" : a.kind === "VIDEO" ? "video" : "file")),
      },
    ]),
  );
  // The photos each event carries that this recipient may open, for What's new's thumbnails (thumbnail made only).
  const photosByEvent = new Map(
    found.map((e) => [
      e.id,
      e.attachments
        .filter((a) => a.kind === "IMAGE" && a.thumbPathname && (row.audience === "staff" || (row.recipientContactId && contractorMaySee(a, row.recipientContactId))))
        .map((a) => a.id),
    ]),
  );
  return { items: reconcileItems(stored, events, row), photosByEvent };
}

/** HG's photos on a job the contractor may open, newest first: the job section's thumbnails. */
async function hgPhotoIds(taskId: string, contactId: string, leaveOut: ReadonlySet<string>): Promise<string[]> {
  const rows = await prisma.taskAttachment.findMany({
    where: { taskId, kind: "IMAGE", deletedAt: null, uploadedByContactId: null, thumbPathname: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { ...SEEABLE_FILE, id: true },
  });
  return rows.filter((a) => !leaveOut.has(a.id) && contractorMaySee(a, contactId)).map((a) => a.id);
}

/**
 * Every write to a claimed row after the claim is an updateMany by id, never
 * an update: deleteTask removes a task's rows by cascade, and a row can go
 * while its email is sending. An update would throw P2025 on the missing row
 * and fail the whole run, leaving every row after it for the next minute;
 * updateMany writes nothing to a row that is gone and the run goes on. An
 * email that went out still counts as sent.
 */
export async function drainDue(now = new Date(), opts: { limit?: number } = {}): Promise<DrainResult> {
  const started = Date.now();
  const limit = opts.limit ?? BATCH;
  const result: DrainResult = { sent: 0, failed: 0, skipped: 0, held: 0 };

  const rows = await prisma.notificationOutbox.findMany({
    where: { sentAt: null, sendAfter: { lte: now } },
    orderBy: { sendAfter: "asc" },
    take: limit,
    select: {
      id: true,
      taskId: true,
      recipientContactId: true,
      recipientUserId: true,
      task: {
        select: {
          title: true,
          unitLabel: true,
          // Read at send time: the buttons follow the job's next step, and the reply line goes only on a job still open.
          status: true,
          // The job as it stands when the email goes (docs/specs/contractor-job-emails.md 2.2).
          dueDate: true,
          scheduledFor: true,
          description: true,
          propertyId: true,
          checklist: { select: { title: true, done: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          assigneeContact: { select: { fullName: true } },
          property: { select: { address: true, photoUrl: true } },
          // Who can open the job right now (D12), checked again at send time.
          access: { where: { revokedAt: null }, select: { contactId: true } },
        },
      },
      recipientUser: { select: { email: true } },
      recipientContact: { select: { active: true, fullName: true, portalAccount: { select: { email: true, status: true, jobEmails: true } } } },
    },
  });
  if (rows.length === 0) return result;

  const sentBefore = await sentTodayCount(now);
  const budget = sendBudget(sentBefore, limit);
  const appUrl = getEnv().appUrl;
  let lastSendAt = 0;
  // Set once Resend refuses for its own limits: everything after waits.
  let refused = false;
  // The partners a contractor's reply line names, read once per run.
  let staffNames: string[] | null = null;

  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    const contractorHasAccess = !!row.recipientContactId && !!row.task?.access.some((a) => a.contactId === row.recipientContactId);
    const delivery = deliveryFor(row, { contractorHasAccess });
    if (!row.task || !row.taskId || !delivery.ok) {
      await closeUnsent(row.id, now, !row.task ? "no task" : delivery.ok ? "no recipient" : delivery.reason);
      result.skipped++;
      continue;
    }
    if (refused || result.sent >= budget) {
      result.held++;
      continue;
    }

    const claimed = await claim(row.id, now);
    if (!claimed) continue;
    const { items, photosByEvent } = await liveItems(row.taskId, parseItems(claimed.items), {
      audience: delivery.audience,
      recipientContactId: row.recipientContactId,
    });
    if (items.length === 0) {
      await prisma.notificationOutbox.updateMany({ where: { id: row.id }, data: { sentAt: now, lastError: "nothing to send" } });
      result.skipped++;
      continue;
    }

    if (delivery.audience === "contractor") staffNames ??= await staffFirstNames();
    const task = row.task;
    // The notes go to the contractor with this property's lockbox codes masked: the code itself stays behind the job's
    // own Lockbox section, where each view is logged (D21), not in an inbox.
    const notes =
      delivery.audience === "contractor" && task.description?.trim()
        ? (await lockboxMasker(prisma, task.propertyId))(task.description).map((part) => ("text" in part ? part.text : CODE_MASK)).join("")
        : null;
    // The bundle's photos, in the order its lines are.
    const newPhotoIds = [...new Set(items.flatMap((i) => (i.eventId ? (photosByEvent.get(i.eventId) ?? []) : [])))];
    const contractorId = delivery.audience === "contractor" ? row.recipientContactId : null;
    const jobPhotoIds = contractorId ? await hgPhotoIds(row.taskId, contractorId, new Set(newPhotoIds)) : [];
    // The email's own link (job-links.ts): a contractor's opens the job as them; a partner's only shows its photos, so
    // it's made only when there are some.
    const linkToken = contractorId
      ? await mintJobLink(prisma, { taskId: row.taskId, kind: "EMAIL", contactId: contractorId })
      : row.recipientUserId && newPhotoIds.length
        ? await mintJobLink(prisma, { taskId: row.taskId, kind: "STAFF", userId: row.recipientUserId })
        : null;
    const hasAccess = !!contractorId && !!(await readLockboxCode(prisma, task.propertyId, task.unitLabel));
    const email = taskEmail({
      items,
      linkToken,
      hasAccess,
      newPhotoIds,
      jobPhotoIds,
      title: task.title,
      address: task.property?.address ?? null,
      unitLabel: task.unitLabel,
      audience: delivery.audience,
      appUrl,
      taskId: row.taskId,
      status: task.status,
      due: toYmd(targetDate(task)),
      today: todayYmdEastern(now),
      notes,
      checklist: task.checklist,
      photoUrl: task.property?.photoUrl ?? null,
      contractorName: task.assigneeContact?.fullName ?? null,
      recipientName: row.recipientContact?.fullName,
      staffNames: staffNames ?? [],
    });
    const rendered = renderJobEmail(email);
    const wait = lastSendAt + SEND_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSendAt = Date.now();
    const res = await sendEmail({ to: delivery.to, subject: email.subject, text: rendered.text, html: rendered.html, threadKey: email.threadKey });

    if (res.ok) {
      await prisma.notificationOutbox.updateMany({ where: { id: row.id }, data: { sentAt: new Date(), lastError: null } });
      result.sent++;
      continue;
    }
    const error = (res.error ?? "send failed").slice(0, 500);
    const failure = sendFailureKind(res);
    if (failure !== "error") {
      // Resend's quota or rate limit, not this email's fault: give the try
      // back, and leave this row and the rest of the batch for a later run.
      refused = true;
      result.held++;
      const until = refusedRetryAt(failure, new Date());
      await prisma.notificationOutbox.updateMany({
        where: { id: row.id },
        data: { sendAfter: until, attempts: { decrement: 1 }, lastError: error },
      });
      if (failure === "quota") {
        // Everything else due waits too, so each later run doesn't spend a refused call. One statement across
        // every task's rows: it takes them in id order, as every outbox lock in core.ts does, and passes over
        // a row a write holds right now (a line queueing, an Undo reading it) instead of waiting on it, so it
        // never deadlocks against them. A row passed over stays due and waits at the next run's refusal.
        await pushBackDue(now, until);
        logError("notifications:resend-quota", new Error("Resend's sending quota is used up; emails wait and retry hourly"), {
          sentToday: sentBefore + result.sent,
        });
      }
      continue;
    }
    result.failed++;
    const next = retryAt(claimed.attempts, new Date());
    await prisma.notificationOutbox.updateMany({
      where: { id: row.id },
      data: next ? { sendAfter: next, lastError: error } : { sentAt: new Date(), lastError: `gave up: ${error}` },
    });
  }

  if (reachedCapNow(sentBefore, result.sent)) {
    logError("notifications:daily-cap", new Error(`Daily email cap of ${DAILY_EMAIL_CAP} reached; the rest go out tomorrow`), {
      sentToday: sentBefore + result.sent,
    });
  }
  return result;
}
