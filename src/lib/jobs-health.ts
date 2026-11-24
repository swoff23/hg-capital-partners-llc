import type { PrismaClient } from "@prisma/client";
import type { Env } from "@/lib/env";
import { DAILY_EMAIL_CAP, easternDayStart } from "@/lib/notifications/content";
import { sentSince } from "@/lib/notifications/sent-count";
import { complaintsSince } from "@/lib/email/delivery-events";

/**
 * Whether the background jobs are doing their work (docs/specs/error-alerts.md,
 * Q9 and Q14 to Q16). The email job runs this after each run and checks in
 * with Sentry: "ok" for no reasons, "error" otherwise. /api/health's
 * token-gated detail shows the reasons, which is what to send Claude.
 *
 * The rules follow how the queue works (Q15):
 *  - email_stuck: an unsent email more than 15 minutes past its send time,
 *    while today's count is under the daily cap. Over the cap, emails wait
 *    for tomorrow with their send time kept on purpose (outbox.ts drainDue).
 *  - email_failing: an unsent email on its third try or later, or one that
 *    gave up on its fifth in the last 24 hours, so a dropped email doesn't
 *    look like a recovery.
 *  - email_capped: today's count has reached DAILY_EMAIL_CAP; 100 in a day
 *    most likely means a loop.
 *  - email_complained: someone marked one of our emails as spam in the last
 *    24 hours (Resend's webhook, src/lib/email/delivery-events.ts). Too many
 *    spam reports and Resend stops sending for the whole domain, so each one
 *    is worth a call (docs/specs/emails-redesign.md, section 5).
 *  - qbo_stale: QuickBooks is on and hasn't synced in 26 hours (the nightly
 *    run plus two hours).
 * Rows closed without sending ("no recipient", "no task") don't count.
 *
 * Takes the client as an argument, as sent-count.ts does, so the rules can be
 * tested without a database.
 */

export type JobReason = "email_stuck" | "email_failing" | "email_capped" | "email_complained" | "qbo_stale";

export const STUCK_AFTER_MS = 15 * 60_000;
export const FAILING_FROM_ATTEMPT = 3;
export const GAVE_UP_WINDOW_MS = 24 * 60 * 60_000;
export const QBO_STALE_AFTER_MS = 26 * 60 * 60_000;
/** How long a spam report keeps the check-in at "error": long enough for the alert, then it clears on its own. */
export const COMPLAINT_WINDOW_MS = 24 * 60 * 60_000;
/** outbox.ts writes this prefix when an email runs out of tries. */
const GAVE_UP = "gave up:";

export interface JobsSnapshot {
  /** Null while email is off. */
  email: { sentToday: number; oldestDueAt: Date | null; retrying: number; gaveUpRecently: number; complainedRecently: number } | null;
  /** Null while QuickBooks is off (Q16). */
  qbo: { lastSuccessfulSyncAt: Date | null; connectedAt: Date } | null;
}

export function jobReasons(snapshot: JobsSnapshot, now: Date): JobReason[] {
  const reasons: JobReason[] = [];
  const { email, qbo } = snapshot;
  if (email) {
    const capped = email.sentToday >= DAILY_EMAIL_CAP;
    if (!capped && email.oldestDueAt && now.getTime() - email.oldestDueAt.getTime() > STUCK_AFTER_MS) reasons.push("email_stuck");
    if (email.retrying > 0 || email.gaveUpRecently > 0) reasons.push("email_failing");
    if (capped) reasons.push("email_capped");
    if (email.complainedRecently > 0) reasons.push("email_complained");
  }
  if (qbo) {
    // A connection that hasn't synced yet counts from when it was made.
    const last = qbo.lastSuccessfulSyncAt ?? qbo.connectedAt;
    if (now.getTime() - last.getTime() > QBO_STALE_AFTER_MS) reasons.push("qbo_stale");
  }
  return reasons;
}

type JobsDb = Pick<PrismaClient, "notificationOutbox" | "securityEvent" | "quickbooksConnection" | "portalAccount" | "user">;

/** Which features are on, from src/lib/env.ts: email needs Resend and the cron secret; QuickBooks needs its keys too (Q16). */
export interface JobsSwitches {
  email: boolean;
  qbo: boolean;
}

/** Without CRON_SECRET neither cron runs (src/lib/secrets.ts cronRefusal), so neither job can be judged stopped. */
export function jobsSwitches(env: Pick<Env, "email" | "qbo" | "CRON_SECRET">): JobsSwitches {
  const cron = !!env.CRON_SECRET?.trim();
  return { email: cron && env.email !== null, qbo: cron && env.qbo !== null };
}

export async function readJobsSnapshot(db: JobsDb, on: JobsSwitches, now: Date): Promise<JobsSnapshot> {
  const [email, qbo] = await Promise.all([
    on.email ? readEmail(db, now) : Promise.resolve(null),
    on.qbo ? readQbo(db) : Promise.resolve(null),
  ]);
  return { email, qbo };
}

async function readEmail(db: JobsDb, now: Date): Promise<NonNullable<JobsSnapshot["email"]>> {
  const [sentToday, oldest, retrying, gaveUpRecently, complainedRecently] = await Promise.all([
    sentSince(db, easternDayStart(now)),
    db.notificationOutbox.findFirst({
      where: { sentAt: null, sendAfter: { lte: now } },
      orderBy: { sendAfter: "asc" },
      select: { sendAfter: true },
    }),
    db.notificationOutbox.count({ where: { sentAt: null, attempts: { gte: FAILING_FROM_ATTEMPT } } }),
    db.notificationOutbox.count({
      where: { sentAt: { gte: new Date(now.getTime() - GAVE_UP_WINDOW_MS) }, lastError: { startsWith: GAVE_UP } },
    }),
    complaintsSince(db, new Date(now.getTime() - COMPLAINT_WINDOW_MS)),
  ]);
  return { sentToday, oldestDueAt: oldest?.sendAfter ?? null, retrying, gaveUpRecently, complainedRecently };
}

/** A revoked connection was turned off on purpose; an expired one still counts, so a dead token alerts. */
async function readQbo(db: JobsDb): Promise<JobsSnapshot["qbo"]> {
  const conn = await db.quickbooksConnection.findFirst({
    where: { status: { not: "REVOKED" } },
    orderBy: { createdAt: "desc" },
    select: { lastSuccessfulSyncAt: true, createdAt: true },
  });
  return conn ? { lastSuccessfulSyncAt: conn.lastSuccessfulSyncAt, connectedAt: conn.createdAt } : null;
}
