import "server-only";
import { getEnv } from "./env";
import { readSessionToken, signSessionToken } from "./session-token";

/**
 * Signed-cookie session. No DB, no third-party auth. The token format and
 * verification live in session-token.ts (pure, tested); this wrapper supplies
 * the secret and the clock.
 */
export const SESSION_COOKIE = "hgos_session";

/** Sessions expire 30 days after sign-in; the cookie's maxAge matches. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function signSession(email: string): string {
  return signSessionToken(email, { secret: getEnv().sessionSecret, now: Date.now(), ttlMs: SESSION_TTL_MS });
}

/**
 * The session's email (lowercased) and when it was issued (ms), or null if
 * missing / invalid / expired. The issue time lets src/lib/auth.ts turn away a
 * session from before the user's last password reset.
 */
export function readSession(value: string | undefined): { email: string; issuedAt: number } | null {
  const payload = readSessionToken(value, { secret: getEnv().sessionSecret, now: Date.now() });
  return payload ? { email: payload.email, issuedAt: payload.iat } : null;
}
