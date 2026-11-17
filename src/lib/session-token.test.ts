import test from "node:test";
import assert from "node:assert/strict";
import { issuedAfterPasswordChange, readSessionToken, signSessionToken } from "./session-token";

const secret = "s".repeat(43);
const now = 1_800_000_000_000;
const ttlMs = 30 * 86_400_000;

test("round-trips and lowercases the email", () => {
  const t = signSessionToken("  Connor@Example.com ", { secret, now, ttlMs });
  const p = readSessionToken(t, { secret, now: now + 1000 });
  assert.deepEqual(p, { email: "connor@example.com", iat: now, exp: now + ttlMs });
});

test("expired tokens are rejected", () => {
  const t = signSessionToken("a@b.c", { secret, now, ttlMs });
  assert.equal(readSessionToken(t, { secret, now: now + ttlMs }), null);
  assert.equal(readSessionToken(t, { secret, now: now + ttlMs + 1 }), null);
  assert.notEqual(readSessionToken(t, { secret, now: now + ttlMs - 1 }), null);
});

test("a different secret is rejected", () => {
  const t = signSessionToken("a@b.c", { secret, now, ttlMs });
  assert.equal(readSessionToken(t, { secret: "t".repeat(43), now }), null);
});

test("tampering with the payload is rejected", () => {
  const t = signSessionToken("a@b.c", { secret, now, ttlMs });
  const [enc, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ email: "admin@b.c", iat: now, exp: now + ttlMs })).toString(
    "base64url",
  );
  assert.equal(readSessionToken(`${forged}.${sig}`, { secret, now }), null);
  assert.equal(readSessionToken(`${enc}.${sig}x`, { secret, now }), null);
});

test("malformed and legacy-format tokens are rejected", () => {
  assert.equal(readSessionToken(undefined, { secret, now }), null);
  assert.equal(readSessionToken("", { secret, now }), null);
  assert.equal(readSessionToken("nodot", { secret, now }), null);
  assert.equal(readSessionToken(".sig", { secret, now }), null);
  assert.equal(readSessionToken("enc.", { secret, now }), null);
  // old format: base64url(email).hmac(email) — signature is over the email, not a payload
  const legacyEnc = Buffer.from("a@b.c").toString("base64url");
  assert.equal(readSessionToken(`${legacyEnc}.anything`, { secret, now }), null);
});

test("a password reset ends sessions issued before it, and only those", () => {
  const reset = new Date(now);
  // Signed in a day before the reset: signed out everywhere.
  assert.equal(issuedAfterPasswordChange(now - 86_400_000, reset), false);
  assert.equal(issuedAfterPasswordChange(now - 1, reset), false);
  // Signed in again with the new password, even in the same millisecond.
  assert.equal(issuedAfterPasswordChange(now, reset), true);
  assert.equal(issuedAfterPasswordChange(now + 5_000, reset), true);
  // Never reset: no cutoff.
  assert.equal(issuedAfterPasswordChange(0, null), true);
});
