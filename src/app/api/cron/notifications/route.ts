import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { drainDue } from "@/lib/notifications/outbox";
import { cronAuthorized } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Once-a-minute cron (vercel.json) that sends the bundled task emails
 * (src/lib/notifications/outbox.ts). Vercel injects
 * `Authorization: Bearer $CRON_SECRET`. Like /api/quickbooks/sync, it answers
 * 503 and sends nothing while CRON_SECRET is unset, and 401 to anyone else.
 *
 *   curl -s -H "Authorization: Bearer $CRON_SECRET" "$PROD/api/cron/notifications" | jq
 */
export async function GET(request: NextRequest) {
  const auth = cronAuthorized(getEnv().CRON_SECRET, request.headers.get("authorization"));
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "The notifications cron stays disabled until CRON_SECRET is set" }, { status: 503 });
  }
  if (auth === "denied") return new NextResponse("Unauthorized", { status: 401 });

  const result = await drainDue(new Date());
  return NextResponse.json(result);
}
