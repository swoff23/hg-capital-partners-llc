import crypto from "node:crypto";

/**
 * Shared-secret checks for the unauthenticated routes. Pure (no `server-only`,
 * no env reads) so it is unit-testable; callers pass `process.env.*` in.
 *
 * Every gate here FAILS CLOSED: an unset secret never grants access. The
 * original code did the opposite (`!token || provided === token`), which is
 * how the production health probe ended up serving its detailed payload to
 * anyone — see the audit, finding 1.
 */

/** Constant-time string equality. False for any mismatch, including length. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * `/api/health` — may this request see migrations, Node version, and DB error
 * text? Only with a configured token AND a matching one. Without a token the
 * probe still answers, but with the minimal `{ ok, db, env, commit }` shape.
 */
export function healthDetailAllowed(
  configuredToken: string | undefined,
  providedToken: string | null | undefined,
): boolean {
  if (!configuredToken) return false;
  return safeEqual(configuredToken, providedToken);
}

export type CronAuth = "ok" | "denied" | "unconfigured";

/**
 * `/api/quickbooks/sync` — Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Unconfigured is its own state so the route can answer 503 (fix the env)
 * rather than 401 (fix the caller), and never runs the sync either way.
 */
export function cronAuthorized(
  configuredSecret: string | undefined,
  authorizationHeader: string | null | undefined,
): CronAuth {
  if (!configuredSecret) return "unconfigured";
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? "");
  if (!m) return "denied";
  return safeEqual(configuredSecret, m[1].trim()) ? "ok" : "denied";
}
