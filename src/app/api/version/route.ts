import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The version that's live: the deploy's commit, or null where there is none
 * (local dev). A tab left open asks it to know when a new version is out
 * (components/update-notice.tsx, docs/specs/update-notice.md). No session and
 * no database: /api/health already shows the same commit to anyone.
 *
 * Skew Protection pins only requests that carry `x-deployment-id`, a `dpl`
 * query or a `__vdpl` cookie. The tab's plain fetch carries none, so it
 * reaches the live deployment even from a tab on an older one.
 */
export function GET() {
  return NextResponse.json({ version: getEnv().VERCEL_GIT_COMMIT_SHA ?? null }, { headers: { "Cache-Control": "no-store" } });
}
