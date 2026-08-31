import { NextResponse, type NextRequest } from "next/server";
import { runQuickbooksSync } from "@/lib/quickbooks/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap

/**
 * Nightly cron (vercel.json) + a manual curl. Vercel injects
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 *
 *   curl -s -H "Authorization: Bearer $CRON_SECRET" "$PROD/api/quickbooks/sync" | jq
 *
 * The in-app "Refresh" button does NOT go through here — it's a server action
 * behind requireUser().
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await runQuickbooksSync({ trigger: "CRON" });
  return NextResponse.json(result, { status: result.status === "FAILED" ? 500 : 200 });
}
