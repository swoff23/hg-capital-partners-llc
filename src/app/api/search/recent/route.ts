import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { readRecents } from "@/lib/recent-views";
import { answerRecent } from "@/lib/search-results";

/**
 * GET /api/search/recent: the records this person opened last, newest first,
 * for the empty command palette (docs/specs/search.md 2.5 and 2.10). Records
 * deleted since and Template tasks are skipped. Staff only, like /api/search.
 */
export async function GET() {
  const user = await getCurrentUser();
  const answer = await answerRecent(user, prisma, (userId) => readRecents(userId), (err) => logError("api.search.recent", err));
  return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "private, no-store" } });
}
