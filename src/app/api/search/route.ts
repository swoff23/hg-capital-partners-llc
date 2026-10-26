import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { answerSearch } from "@/lib/search-results";

/**
 * GET /api/search?q=&type=&limit= (docs/specs/search.md 2.10): records in
 * groups, ranked, with the total of every match. Staff only: a contractor's
 * portal session is a different cookie, so it gets the 401 here. The query,
 * ranking and shapes are in lib/search-results.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const answer = await answerSearch(user, new URL(request.url).searchParams, prisma, (err) => logError("api.search", err));
  return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "private, no-store" } });
}
