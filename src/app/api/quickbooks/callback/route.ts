import { after, NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { qbo } from "@/lib/quickbooks/config";
import { encryptSecret } from "@/lib/quickbooks/crypto";
import { exchangeCode, verifyState } from "@/lib/quickbooks/oauth";
import { runQuickbooksSync } from "@/lib/quickbooks/sync";

export const dynamic = "force-dynamic";
// The initial sync runs in after(); without this the platform default can kill it mid-run.
export const maxDuration = 60;

/** Intuit redirects here with ?code&state&realmId. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const settings = new URL("/financials/settings", url.origin);
  const fail = (error: string) => {
    settings.searchParams.set("error", error);
    const res = NextResponse.redirect(settings);
    res.cookies.delete("qbo_oauth_state");
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const nonce = (await cookies()).get("qbo_oauth_state")?.value;

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  if (!code || !state || !realmId) return fail("missing_params");
  if (!nonce || verifyState(state) !== nonce) return fail("state_mismatch");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch {
    return fail("token_exchange_failed");
  }

  await prisma.quickbooksConnection.upsert({
    where: { realmId },
    create: {
      realmId,
      environment: qbo.environment(),
      status: "ACTIVE",
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      accountingMethod: "CASH",
      historyStart: qbo.historyStart(),
      connectedByUserId: user.id,
    },
    update: {
      environment: qbo.environment(),
      status: "ACTIVE",
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      prevRefreshTokenEnc: null,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      connectedByUserId: user.id,
    },
  });

  // fire-and-forget the first sync (bounded by the function's maxDuration)
  after(async () => {
    try {
      await runQuickbooksSync({ trigger: "INITIAL" });
    } catch (e) {
      console.error("[qbo] initial sync failed", e);
    }
  });

  settings.searchParams.set("connected", "1");
  const res = NextResponse.redirect(settings);
  res.cookies.delete("qbo_oauth_state");
  return res;
}
