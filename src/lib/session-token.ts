import crypto from "node:crypto";
import { safeEqual } from "./secrets";

/**
 * Signed session token: `base64url(payload).hmac`. Pure — the secret and the
 * clock are passed in, so this is unit-testable; src/lib/session.ts is the
 * server-only wrapper that supplies both.
 *
 * The payload carries the email plus issued-at / expires-at (ms since epoch).
 * The previous format was a bare HMAC of the email with no expiry, so a leaked
 * cookie was valid forever. Old-format cookies fail `readSessionToken` and the
 * user is simply asked to sign in again.
 */

export interface SessionPayload {
  email: string;
  iat: number;
  exp: number;
}

function mac(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSessionToken(
  email: string,
  opts: { secret: string; now: number; ttlMs: number },
): string {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    iat: opts.now,
    exp: opts.now + opts.ttlMs,
  };
  const enc = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${enc}.${mac(opts.secret, enc)}`;
}

/** The payload, or null when the token is missing, malformed, tampered, or expired. */
export function readSessionToken(
  value: string | undefined | null,
  opts: { secret: string; now: number },
): SessionPayload | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const enc = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!safeEqual(sig, mac(opts.secret, enc))) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<SessionPayload>;
  if (typeof p.email !== "string" || !p.email) return null;
  if (typeof p.iat !== "number" || typeof p.exp !== "number") return null;
  if (!Number.isFinite(p.exp) || p.exp <= opts.now) return null;
  return { email: p.email.toLowerCase(), iat: p.iat, exp: p.exp };
}
