import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTAL_SESSION_TTL_MS,
  RESET_LIMITS,
  RESET_TOKEN_TTL_MS,
  resetRequestAllowed,
  resetTokenExpiresAt,
  resetWindowStart,
  sessionExpiresAt,
  sessionIsLive,
  shouldTouchSession,
} from "./limits";

const now = new Date("2026-10-26T15:00:00Z");
const HOUR = 60 * 60 * 1000;

test("sessions last 30 days, reset links 30 minutes", () => {
  assert.equal(PORTAL_SESSION_TTL_MS, 30 * 24 * HOUR);
  assert.equal(sessionExpiresAt(now).toISOString(), "2026-11-25T15:00:00.000Z");
  assert.equal(RESET_TOKEN_TTL_MS, HOUR / 2);
  assert.equal(resetTokenExpiresAt(now).toISOString(), "2026-10-26T15:30:00.000Z");
});

test("a session is live until revoked or expired", () => {
  const future = new Date(now.getTime() + 1000);
  assert.equal(sessionIsLive({ expiresAt: future, revokedAt: null }, now), true);
  assert.equal(sessionIsLive({ expiresAt: future, revokedAt: now }, now), false);
  assert.equal(sessionIsLive({ expiresAt: now, revokedAt: null }, now), false, "expiry is exclusive");
});

test("last-used is touched at most once a day", () => {
  assert.equal(shouldTouchSession(new Date(now.getTime() - 23 * HOUR), now), false);
  assert.equal(shouldTouchSession(new Date(now.getTime() - 24 * HOUR), now), true);
  assert.equal(shouldTouchSession(new Date(now.getTime() - 40 * 24 * HOUR), now), true);
});

test("the reset window looks back one hour", () => {
  assert.equal(resetWindowStart(now).toISOString(), "2026-10-26T14:00:00.000Z");
  assert.equal(resetWindowStart(now, 5 * 60_000).toISOString(), "2026-10-26T14:55:00.000Z");
});

test("3 per email and 10 per IP per hour", () => {
  assert.deepEqual(RESET_LIMITS, { perEmail: 3, perIp: 10, windowMs: HOUR });
  assert.equal(resetRequestAllowed({ email: 0, ip: 0 }), true);
  assert.equal(resetRequestAllowed({ email: 2, ip: 9 }), true);
  assert.equal(resetRequestAllowed({ email: 3, ip: 0 }), false);
  assert.equal(resetRequestAllowed({ email: 0, ip: 10 }), false);
  assert.equal(resetRequestAllowed({ email: 1, ip: 1 }, { perEmail: 1, perIp: 5 }), false);
});
