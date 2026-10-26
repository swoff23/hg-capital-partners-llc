import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { answerAddresses } from "@/lib/address-suggestions";

/**
 * GET /api/addresses?q=&kind=property|deal&exclude= (docs/specs/forms-editing.md
 * 2.6): what AddressCombobox suggests while someone types an address, from
 * HG's own properties and deals, and the record the typed address already
 * is. Staff only: a contractor's portal session is a different cookie, so it
 * gets the 401 here. The query and the rules are in lib/address-suggestions.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const answer = await answerAddresses(user, new URL(request.url).searchParams, prisma, (err) =>
    logError("api.addresses", err),
  );
  return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "private, no-store" } });
}
