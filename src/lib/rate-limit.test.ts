import test from "node:test";
import assert from "node:assert/strict";
import { clientIp, RateLimiter } from "./rate-limit";

test("RateLimiter allows up to max hits per window, then refuses with a retry hint", () => {
  const rl = new RateLimiter(3, 1000);
  const t = 10_000;
  assert.deepEqual(rl.allow("a", t), { ok: true });
  assert.deepEqual(rl.allow("a", t + 10), { ok: true });
  assert.deepEqual(rl.allow("a", t + 20), { ok: true });
  assert.deepEqual(rl.allow("a", t + 30), { ok: false, retryAfterMs: 970 });
  assert.deepEqual(rl.allow("b", t + 30), { ok: true }); // independent key
  assert.deepEqual(rl.allow("a", t + 1001), { ok: true }); // first hit aged out
});

test("prune drops idle keys", () => {
  const rl = new RateLimiter(1, 100);
  rl.allow("x", 0);
  rl.prune(50);
  assert.equal(rl.allow("x", 60).ok, false);
  rl.prune(200);
  assert.equal(rl.allow("x", 201).ok, true);
});

test("clientIp reads the first forwarded hop", () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientIp(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(h({})), "unknown");
});
