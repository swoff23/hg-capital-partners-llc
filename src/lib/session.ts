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

/** The session's email (lowercased), or null if missing / invalid / expired. */
export function readSession(value: string | undefined): string | null {
  return readSessionToken(value, { secret: getEnv().sessionSecret, now: Date.now() })?.email ?? null;
}
