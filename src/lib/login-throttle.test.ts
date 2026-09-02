import test from "node:test";
import assert from "node:assert/strict";
import { LoginThrottle } from "./login-throttle";

const MIN = 60_000;

test("locks after the configured number of failures and unlocks after lockMs", () => {
  const t = new LoginThrottle({ maxFailures: 3, windowMs: 15 * MIN, lockMs: 10 * MIN });
  const now = 1_000_000;
  assert.deepEqual(t.check("A@b.c", now), { locked: false });
  assert.equal(t.recordFailure("a@b.c", now), false);
  assert.equal(t.recordFailure("a@b.c", now + 1), false);
  assert.equal(t.recordFailure("a@b.c", now + 2), true);
  assert.deepEqual(t.check("a@b.c", now + 3), { locked: true, retryAfterMs: 10 * MIN - 1 });
  assert.deepEqual(t.check("A@B.C", now + 10 * MIN + 2), { locked: false });
});

test("failures outside the window do not count", () => {
  const t = new LoginThrottle({ maxFailures: 3, windowMs: 5 * MIN, lockMs: 10 * MIN });
  const now = 1_000_000;
  t.recordFailure("x", now);
  t.recordFailure("x", now + MIN);
  // the first two have aged out by now + 6min
  assert.equal(t.recordFailure("x", now + 6 * MIN), false);
  assert.equal(t.recordFailure("x", now + 6 * MIN + 1), false);
  assert.equal(t.recordFailure("x", now + 6 * MIN + 2), true);
});

test("reset clears the key; keys are independent", () => {
  const t = new LoginThrottle({ maxFailures: 2 });
  const now = 1_000_000;
  t.recordFailure("a", now);
  t.recordFailure("a", now);
  assert.equal(t.check("a", now).locked, true);
  assert.equal(t.check("b", now).locked, false);
  t.reset("a");
  assert.equal(t.check("a", now).locked, false);
});

test("prune drops expired entries", () => {
  const t = new LoginThrottle({ maxFailures: 2, windowMs: MIN, lockMs: MIN });
  const now = 1_000_000;
  t.recordFailure("a", now);
  t.recordFailure("b", now);
  t.recordFailure("b", now);
  t.prune(now + 2 * MIN);
  assert.equal(t.check("b", now + 2 * MIN).locked, false);
});
