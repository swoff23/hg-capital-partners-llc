import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { drainDue } from "@/lib/notifications/outbox";
import { queueDueReminders } from "@/lib/notifications/reminders";
import { cronAuthorized, cronRefusal } from "@/lib/secrets";

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
  return NextResponse.json({ ...result, reminders: reminders.queued });
}
