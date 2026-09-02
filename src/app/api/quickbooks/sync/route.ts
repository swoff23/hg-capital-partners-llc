import { NextResponse, type NextRequest } from "next/server";
import { runQuickbooksSync } from "@/lib/quickbooks/sync";
import { getEnv } from "@/lib/env";
import { cronAuthorized } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap

/**
 * Nightly cron (vercel.json) + a manual curl. Vercel injects
 * `Authorization: Bearer $CRON_SECRET` on cron invocations. CRON_SECRET is
 * REQUIRED: with it unset this route answers 503 and never runs the sync
 * (it used to skip the check entirely, leaving a public full-ledger rewrite).
 *
 *   curl -s -H "Authorization: Bearer $CRON_SECRET" "$PROD/api/quickbooks/sync" | jq
 *
 * The in-app "Refresh" button does NOT go through here — it's a server action
 * behind requireUser().
 */
export async function GET(request: NextRequest) {
  const auth = cronAuthorized(getEnv().CRON_SECRET, request.headers.get("authorization"));
  if (auth === "unconfigured") {
    return NextResponse.json(
      { error: "CRON_SECRET is not set — the sync route is disabled until it is" },
      { status: 503 },
    );
  }
  if (auth === "denied") return new NextResponse("Unauthorized", { status: 401 });

  const result = await runQuickbooksSync({ trigger: "CRON" });
  return NextResponse.json(result, { status: result.status === "FAILED" ? 500 : 200 });
}
