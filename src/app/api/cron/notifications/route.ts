import { NextResponse, after, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { checkInBackgroundJobs } from "@/lib/jobs-check-in";
import { logError } from "@/lib/log";
import { settleMissingInfo } from "@/lib/missing/service";
import { drainDue } from "@/lib/notifications/outbox";
import { queueDueReminders } from "@/lib/notifications/reminders";
import { sendResidentUpdates } from "@/lib/residents/updates";
import { cronAuthorized, cronRefusal } from "@/lib/secrets";
import { sweepDiscardedDrafts } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Once-a-minute cron (vercel.json) that sends the bundled task emails
 * (src/lib/notifications/outbox.ts), and in the 8 o'clock hour queues the
 * day's "Due today" and "Due yesterday" emails (reminders.ts). Vercel injects
 * `Authorization: Bearer $CRON_SECRET`. Like /api/quickbooks/sync, it answers
 * 503 and sends nothing while CRON_SECRET is unset, and 401 to anyone else.
 * Neither body says why (cronRefusal); the unset secret goes to the logs.
 *
 * It also sends residents their request updates (lib/residents/updates.ts), and ticks Make task's checklist items whose Missing info rows were filled
 * in anywhere in the app, and finishes a task when its last one ticks
 * (docs/specs/missing-info.md, D9). A failure there is logged and never stops
 * the emails.
 *
 * And it deletes the drafts from Claude that a partner discarded more than
 * ten minutes ago, with their files (docs/specs/tasks-from-claude.md 6.3;
 * tasks/core.ts sweepDiscardedDrafts): Discard only hides a draft, so its Undo
 * can bring it back whole, and this is where it goes for good. A failure
 * there is logged too, and the drafts wait for the next minute.
 *
 * After a run it checks in with Sentry's "background-jobs" monitor, which is
 * how a stopped job, a stuck queue or a stale QuickBooks sync reaches Connor
 * (docs/specs/error-alerts.md, Q14). A run that throws never checks in, and
 * five missed check-ins alert on their own.
 *
 *   curl -s -H "Authorization: Bearer $CRON_SECRET" "$PROD/api/cron/notifications" | jq
 */
export async function GET(request: NextRequest) {
  const auth = cronAuthorized(getEnv().CRON_SECRET, request.headers.get("authorization"));
  const refused = cronRefusal(auth);
  if (refused) {
    if (auth === "unconfigured") console.warn("[cron:notifications] not run: CRON_SECRET is unset or blank");
    return new NextResponse(refused.body, { status: refused.status });
  }

  const now = new Date();
  // The 8 am emails join the outbox first (they send a bundle's quiet minutes later), then the run sends what's due.
  const reminders = await queueDueReminders(now);
  const result = await drainDue(now);
  const settled = await settleMissingInfo().catch((err: unknown) => {
    logError("cron:missing-info", err);
    return 0;
  });
  // A resident's update emails (docs/specs/maintenance-requests.md, section 5). A failure is logged and never stops the rest.
  const residents = await sendResidentUpdates(now).catch((err: unknown) => {
    logError("cron:resident-updates", err);
    return { sent: 0, recorded: 0 };
  });
  const discarded = await sweepDiscardedDrafts(now).catch((err: unknown) => {
    logError("cron:discarded-drafts", err);
    return 0;
  });
  after(() => checkInBackgroundJobs(new Date()));
  return NextResponse.json({ ...result, reminders: reminders.queued, settled, residentEmails: residents.sent, discarded });
}
