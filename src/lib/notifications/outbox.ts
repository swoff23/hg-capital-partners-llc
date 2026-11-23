import "server-only";
import { prisma } from "@/lib/db";
import { replyAddress } from "@/lib/email/inbound";
import { renderJobEmail } from "@/lib/email/render";
import { toYmd, todayYmdEastern } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { SEEABLE_FILE, contractorMaySee } from "@/lib/attachments/access";
import { CODE_MASK, lockboxMasker, readJobAccess } from "@/lib/portal/access-code";
import { mintJobLink } from "@/lib/portal/job-links";
import { gettingInWords } from "@/lib/portal/job-view";
import { staffFirstNames } from "@/lib/portal/queries";
import {
  DAILY_EMAIL_CAP,
  aboutContactId,
  claimedRowVerdict,
  deletedRowVerdict,
  dueRowVerdict,
  easternDayStart,
  parseItems,
  reachedCapNow,
  reconcileItems,
  refusedRetryAt,
  retryAt,
  sendBudget,
  sendFailureKind,
  removedEmail,
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
 * Whether a row goes is decided twice, by two rules in content.ts that a
 * database test runs on real rows: once on the row as the batch read found
 * it (dueRowVerdict), and again on the job and the recipient's access read
 * after the claim (claimedRowVerdict). Either can close it unsent. A row
 * whose task is a draft from Claude is closed by both, whoever it is for.
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

/** Close a row without sending: no login, no access, no recipient, no task, or its task is a draft. */
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
    where: { taskId, kind: "IMAGE", visibility: "SHARED", deletedAt: null, uploadedByContactId: null, thumbPathname: { not: null } },
    orderBy: { createdAt: "desc" },
    // Enough for six and a true "+N"; a job with more than this many photos reads "+" a little low.
    take: 100,
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
      // Read before the claim only to see whether it says they're off the job (offItems); what's sent is the claim's.
      items: true,
      task: {
        select: {
          title: true,
          unitLabel: true,
          // Read at send time: the button follows the job's next step, and the reply line goes only on a job still open.
          status: true,
          // The job as it stands when the email goes (docs/specs/emails-redesign.md, Q4).
          dueDate: true,
          scheduledFor: true,
          description: true,
          waitingOn: true,
          propertyId: true,
          // Permission to enter decides whether the lockbox shows at an occupied home (tenants.md section 8).
          entryPermittedAt: true,
          checklist: { select: { title: true, done: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          assigneeContact: { select: { fullName: true } },
          property: { select: { address: true } },
          // A resident's request: their words in full and their answers, for the New request email (Q9).
          resident: { select: { whatsWrong: true, details: true, letUsIn: true, pets: true, petsNote: true } },
          // Who can open the job right now (D12), checked again at send time.
          access: { where: { revokedAt: null }, select: { contactId: true } },
        },
      },
      recipientUser: { select: { email: true } },
      recipientContact: { select: { active: true, portalAccount: { select: { email: true, status: true, jobEmails: true } } } },
    },
  });
  if (rows.length === 0) return result;

  const sentBefore = await sentTodayCount(now);
  const budget = sendBudget(sentBefore, limit);
  const appUrl = getEnv().appUrl;
  let lastSendAt = 0;
  // Set once Resend refuses for its own limits: everything after waits.
  let refused = false;
  // The partners a closed job's footer names, read once per run.
  let staffNames: string[] | null = null;
  const replyConfig = getEnv().email;

  /** Send one rendered email for a claimed row, and write what happened to the row. */
  const deliver = async (rowId: string, attempts: number, msg: Parameters<typeof sendEmail>[0]): Promise<void> => {
    const wait = lastSendAt + SEND_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSendAt = Date.now();
    const res = await sendEmail(msg);
    if (res.ok) {
      await prisma.notificationOutbox.updateMany({ where: { id: rowId }, data: { sentAt: new Date(), lastError: null } });
      result.sent++;
      return;
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
        where: { id: rowId },
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
      return;
    }
    result.failed++;
    const next = retryAt(attempts, new Date());
    await prisma.notificationOutbox.updateMany({
      where: { id: rowId },
      data: next ? { sendAfter: next, lastError: error } : { sentAt: new Date(), lastError: `gave up: ${error}` },
    });
  };

  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    // A deleted job's Removed email (core.ts deleteTask): a row of its own with no task, which says only that.
    if (!row.taskId) {
      const gone = deletedRowVerdict(row);
      if (!gone.send) {
        await closeUnsent(row.id, now, gone.reason);
        result.skipped++;
        continue;
      }
      if (refused || result.sent >= budget) {
        result.held++;
        continue;
      }
      const claimedGone = await claim(row.id, now);
      if (!claimedGone) continue;
      const off = parseItems(claimedGone.items).find((i) => i.kind === "OFF" && typeof i.title === "string") ?? gone.off;
      const email = removedEmail({ off, title: off.title ?? "", where: off.where ?? "", short: [off.title, off.where?.replace(" · ", ", ")].filter(Boolean).join(", "), taskId: off.taskId ?? null, today: todayYmdEastern(now) });
      const rendered = renderJobEmail(email);
      // No reply address: a link needs the job, and the job is gone. A reply reaches the jobs inbox (replies.ts).
      await deliver(row.id, claimedGone.attempts, { to: gone.to, subject: email.subject, text: rendered.text, html: rendered.html, threadKey: email.threadKey, fromName: email.fromName });
      continue;
    }

    // The first decision, on the row as the batch read found it: no task, a draft, no login, no access, emails off.
    const first = dueRowVerdict(row);
    if (!first.send) {
      await closeUnsent(row.id, now, first.reason);
      result.skipped++;
      continue;
    }
    const { delivery, taskId } = first;
    if (refused || result.sent >= budget) {
      result.held++;
      continue;
    }

    const claimed = await claim(row.id, now);
    if (!claimed) continue;
    const live = await liveItems(taskId, parseItems(claimed.items), {
      audience: delivery.audience,
      recipientContactId: row.recipientContactId,
    });
    const photosByEvent = live.photosByEvent;
    // The job's state and the recipient's access, read again now the row is claimed: the batch read before the claim can
    // be a write behind (taken off and put back, canceled, a date moved, an Add undone), and these decide what goes.
    const [fresh, accessRow, seen] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          status: true,
          dueDate: true,
          scheduledFor: true,
          description: true,
          waitingOn: true,
          assigneeContactId: true,
          assigneeUserId: true,
          checklist: { select: { title: true, done: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        },
      }),
      delivery.audience === "contractor" && row.recipientContactId
        ? prisma.taskAccess.findFirst({ where: { taskId, contactId: row.recipientContactId, revokedAt: null }, select: { id: true } })
        : null,
      // A partner who opened the task since its newest line already saw it in the app (Q6).
      delivery.audience === "staff" && row.recipientUserId
        ? prisma.taskReadState.findUnique({ where: { taskId_userId: { taskId, userId: row.recipientUserId } }, select: { lastSeenAt: true } })
        : null,
    ]);
    // The second decision: the task gone or a draft since, nothing left that leads an email, or seen in the app.
    // Who lives there, for Tell the tenant and Getting in (docs/specs/emails-redesign.md, Q4 and Q8): read once for a contractor.
    const jobAccess = delivery.audience === "contractor" && row.recipientContactId ? await readJobAccess(prisma, first.task) : null;
    const second = claimedRowVerdict({
      audience: delivery.audience,
      items: live.items,
      job: fresh,
      hasAccess: !!accessRow,
      needsNotice: !!jobAccess?.needsNotice,
      seenAt: seen?.lastSeenAt ?? null,
      today: todayYmdEastern(now),
    });
    if (!second.send) {
      await prisma.notificationOutbox.updateMany({ where: { id: row.id }, data: { sentAt: now, lastError: second.reason } });
      result.skipped++;
      continue;
    }
    const { items, due, scheduled, job } = second;
    const task = { ...first.task, ...job, checklist: fresh?.checklist ?? first.task.checklist };
    const off = items.some((i) => i.kind === "OFF");

    if (delivery.audience === "contractor") staffNames ??= await staffFirstNames();
    // The notes go to the contractor with this property's lockbox codes masked: the code itself stays behind the job's
    // own Lockbox section, where each view is logged (D21), not in an inbox.
    const notes =
      delivery.audience === "contractor" && task.description?.trim()
        ? (await lockboxMasker(prisma, task.propertyId))(task.description).map((part) => ("text" in part ? part.text : CODE_MASK)).join("")
        : null;
    // The bundle's photos, in the order its lines are.
    const newPhotoIds = off ? [] : [...new Set(items.flatMap((i) => (i.eventId ? (photosByEvent.get(i.eventId) ?? []) : [])))];
    // Off the job: no link, photos or lockbox (content.ts removedEmail).
    const contractorId = delivery.audience === "contractor" && !off ? row.recipientContactId : null;
    const jobPhotoIds = contractorId ? await hgPhotoIds(taskId, contractorId, new Set(newPhotoIds)) : [];
    // The email's own link (job-links.ts): a contractor's opens the job as them; a partner's only shows its photos, so
    // it's made only when there are some.
    const linkToken = contractorId
      ? await mintJobLink(prisma, { taskId: taskId, kind: "EMAIL", contactId: contractorId })
      : row.recipientUserId && newPhotoIds.length
        ? await mintJobLink(prisma, { taskId: taskId, kind: "STAFF", userId: row.recipientUserId })
        : null;
    // Getting in in the job page's own words, while the job is theirs and open (never the code, a name or a number).
    const access = contractorId ? jobAccess : null;
    const gettingIn = access ? gettingInWords({ permitted: access.permitted, hasLockbox: !!access.lockbox, needsNotice: access.needsNotice, vacant: access.vacant, tenants: access.tenants.length }) : null;
    // Its own reply address, while replies by email are on: a reply posts to this job as this recipient. Removed gets
    // one too (section 7). A partner's names the contractor the email was about, so a reply about someone who left the
    // job can post Internal (replies.ts). None on a resident's request nobody has yet: there is no one to answer.
    const assigned = !!(job.assigneeContactId || job.assigneeUserId);
    const unassignedRequest = delivery.audience === "staff" && !!first.task.resident && !assigned;
    const replyWho = row.recipientContactId
      ? { contactId: row.recipientContactId }
      : row.recipientUserId
        ? { userId: row.recipientUserId, contactId: aboutContactId(items) ?? job.assigneeContactId ?? null }
        : null;
    const replyToken = replyConfig?.webhookSecret && replyWho && !unassignedRequest ? await mintJobLink(prisma, { taskId: taskId, kind: "REPLY", ...replyWho }) : null;
    const email = taskEmail({
      items,
      linkToken,
      newPhotoIds,
      jobPhotoIds,
      title: task.title,
      address: task.property?.address ?? null,
      unitLabel: task.unitLabel,
      audience: delivery.audience,
      appUrl,
      taskId: taskId,
      status: task.status,
      due,
      scheduled,
      planned: toYmd(task.scheduledFor),
      today: todayYmdEastern(now),
      notes,
      checklist: task.checklist,
      waitingOn: task.waitingOn,
      gettingIn,
      contractorName: task.assigneeContact?.fullName ?? null,
      staffNames: staffNames ?? [],
      replyByEmail: !!replyToken,
      assigned,
      request: first.task.resident ?? null,
    });
    const rendered = renderJobEmail(email);
    await deliver(row.id, claimed.attempts, {
      to: delivery.to,
      subject: email.subject,
      text: rendered.text,
      html: rendered.html,
      threadKey: email.threadKey,
      fromName: email.fromName,
      ...(replyToken && replyConfig ? { replyTo: replyAddress(replyToken, replyConfig.from) } : {}),
    });
  }

  if (reachedCapNow(sentBefore, result.sent)) {
    // A warning: the background jobs' check-in says "email_capped" and alerts (src/lib/jobs-health.ts).
    logError(
      "notifications:daily-cap",
      new Error(`Daily email cap of ${DAILY_EMAIL_CAP} reached; the rest go out tomorrow`),
      { sentToday: sentBefore + result.sent },
      { level: "warning" },
    );
  }
  return result;
}
