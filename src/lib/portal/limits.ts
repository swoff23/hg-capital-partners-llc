/**
 * Time rules for contractor sign-in (docs/asana-migration-plan.md §5.1).
 * Pure, clock passed in; see limits.test.ts.
 */

/** Signed in for 30 days, like staff (D14). The cookie's Max-Age matches. */
export const PORTAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** lastUsedAt / lastSeenAt are written at most this often, not on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A reset link works for 30 minutes, once. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** "Forgot password" requests per rolling hour, counted from SecurityEvent rows. */
export const RESET_LIMITS = { perEmail: 3, perIp: 10, windowMs: 60 * 60 * 1000 } as const;

export function sessionExpiresAt(now: Date): Date {
  return new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
}

export function resetTokenExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

/** A session row still admits its cookie: not revoked, not past its expiry. */
export function sessionIsLive(s: { expiresAt: Date; revokedAt: Date | null }, now: Date): boolean {
  return !s.revokedAt && s.expiresAt.getTime() > now.getTime();
}

export function shouldTouchSession(lastUsedAt: Date, now: Date): boolean {
  return now.getTime() - lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}

/** Start of the rolling window the reset counts look back over. */
export function resetWindowStart(now: Date, windowMs: number = RESET_LIMITS.windowMs): Date {
  return new Date(now.getTime() - windowMs);
}

/**
 * May one more reset request go through, given how many were accepted in the
 * window for this email and for this IP? Blocked requests aren't written, so
 * they don't count: a flood can't keep the window full on its own.
 */
export function resetRequestAllowed(
  counts: { email: number; ip: number },
  limits: { perEmail: number; perIp: number } = RESET_LIMITS,
): boolean {
  return counts.email < limits.perEmail && counts.ip < limits.perIp;
}
