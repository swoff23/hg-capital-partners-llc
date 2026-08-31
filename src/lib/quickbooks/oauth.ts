import "server-only";
import crypto from "node:crypto";
import { qbo } from "./config";

/**
 * OAuth 2.0 with Intuit. `state` is signed with the app's existing SESSION_SECRET
 * (same HMAC idiom as src/lib/session.ts). Tokens are handled in plaintext only
 * here and in client.ts#withFreshToken; at rest they're AES-GCM (crypto.ts).
 */

const STATE_SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-in-prod";

export function signState(nonce: string): string {
  const mac = crypto.createHmac("sha256", STATE_SECRET).update(nonce).digest("base64url");
  return `${Buffer.from(nonce).toString("base64url")}.${mac}`;
}

export function verifyState(value: string | undefined | null): string | null {
  if (!value || !value.includes(".")) return null;
  const [enc, mac] = value.split(".");
  let nonce: string;
  try {
    nonce = Buffer.from(enc, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", STATE_SECRET).update(nonce).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? nonce : null;
}

export function authorizeUrl(signedState: string): string {
  const p = new URLSearchParams({
    client_id: qbo.clientId(),
    response_type: "code",
    scope: qbo.scope,
    redirect_uri: qbo.redirectUri(),
    state: signedState,
  });
  return `${qbo.authorizeUrl}?${p.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${qbo.clientId()}:${qbo.clientSecret()}`).toString("base64");
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(qbo.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    // Intuit returns {"error":"invalid_grant"} on a dead refresh token
    throw new QboOAuthError(res.status, text);
  }
  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };
  const now = Date.now();
  return {
    accessToken: json.access_token,
    accessTokenExpiresAt: new Date(now + json.expires_in * 1000),
    refreshToken: json.refresh_token,
    refreshTokenExpiresAt: new Date(now + json.x_refresh_token_expires_in * 1000),
  };
}

export class QboOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Intuit OAuth ${status}: ${body.slice(0, 200)}`);
    this.name = "QboOAuthError";
  }
  get isInvalidGrant(): boolean {
    return this.status === 400 && /invalid_grant/.test(this.body);
  }
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: qbo.redirectUri(),
    }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(qbo.revokeUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
  });
  // 200 = revoked; Intuit also returns 200 for an already-invalid token
  if (!res.ok && res.status !== 400) {
    throw new QboOAuthError(res.status, await res.text());
  }
}
