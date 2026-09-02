import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { qbo } from "@/lib/quickbooks/config";
import { authorizeUrl, signState } from "@/lib/quickbooks/oauth";

export const dynamic = "force-dynamic";

/** Kicks off the Intuit OAuth flow. Top-level browser navigation from the settings page. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!qbo.isConfigured()) {
    return NextResponse.json(
      { error: "QuickBooks is not configured — set QBO_CLIENT_ID / SECRET / REDIRECT_URI / TOKEN_SECRET" },
      { status: 503 },
    );
  }

  const nonce = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(signState(nonce)));
  res.cookies.set("qbo_oauth_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().isProduction,
    path: "/",
    maxAge: 600,
  });
  return res;
}
