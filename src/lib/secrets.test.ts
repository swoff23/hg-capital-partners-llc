import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cronAuthorized, cronRefusal, healthDetailAllowed, safeEqual } from "./secrets";

test("safeEqual: equal strings only", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual("abc", null), false);
  assert.equal(safeEqual(undefined, "abc"), false);
  assert.equal(safeEqual(undefined, undefined), false);
});

test("healthDetailAllowed fails closed when no token is configured", () => {
  assert.equal(healthDetailAllowed(undefined, null), false);
  assert.equal(healthDetailAllowed(undefined, "anything"), false);
  assert.equal(healthDetailAllowed("", ""), false);
});

test("healthDetailAllowed requires an exact match", () => {
  assert.equal(healthDetailAllowed("s3cret", "s3cret"), true);
  assert.equal(healthDetailAllowed("s3cret", "s3cre"), false);
  assert.equal(healthDetailAllowed("s3cret", null), false);
  assert.equal(healthDetailAllowed("s3cret", undefined), false);
});

test("cronAuthorized: unconfigured secret never authorizes", () => {
  assert.equal(cronAuthorized(undefined, "Bearer x"), "unconfigured");
  assert.equal(cronAuthorized("", "Bearer x"), "unconfigured");
  assert.equal(cronAuthorized(undefined, null), "unconfigured");
});

test("cronAuthorized: bearer must match exactly", () => {
  assert.equal(cronAuthorized("cron-1", "Bearer cron-1"), "ok");
  assert.equal(cronAuthorized("cron-1", "bearer cron-1"), "ok"); // scheme is case-insensitive
  assert.equal(cronAuthorized("cron-1", "Bearer  cron-1 "), "ok"); // tolerant of whitespace
  assert.equal(cronAuthorized("cron-1", "Bearer cron-2"), "denied");
  assert.equal(cronAuthorized("cron-1", "cron-1"), "denied"); // missing scheme
  assert.equal(cronAuthorized("cron-1", "Basic cron-1"), "denied");
  assert.equal(cronAuthorized("cron-1", null), "denied");
  assert.equal(cronAuthorized("cron-1", ""), "denied");
});

test("cronRefusal: the status says which side to fix, the body never says why", () => {
  assert.deepEqual(cronRefusal("unconfigured"), { status: 503, body: "Service Unavailable" });
  assert.deepEqual(cronRefusal("denied"), { status: 401, body: "Unauthorized" });
  assert.equal(cronRefusal("ok"), null);
});

test("the cron routes answer through cronRefusal, so the public 503 doesn't name CRON_SECRET", () => {
  // Both used to answer anyone with "… stays disabled until CRON_SECRET is set".
  for (const route of ["src/app/api/cron/notifications/route.ts", "src/app/api/quickbooks/sync/route.ts"]) {
    const src = readFileSync(join(process.cwd(), route), "utf8");
    assert.match(src, /cronRefusal\(auth\)/, route);
    assert.doesNotMatch(src, /NextResponse\.json\(\s*\{\s*error:[^}]*CRON_SECRET/, route);
    assert.doesNotMatch(src, /until CRON_SECRET is set/, route);
  }
});
