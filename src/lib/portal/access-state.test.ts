import test from "node:test";
import assert from "node:assert/strict";
import { portalAccess, type PortalAccessFacts } from "./access-state";

// 2pm Eastern on Fri Oct 23, 2026.
const now = new Date("2026-10-23T18:00:00Z");
const base: PortalAccessFacts = { status: "ACTIVE", mustChangePassword: true, lastSignInAt: null, lastSeenAt: null };

test("a login nobody has used reads Invited, not Active (BCONTRACT-004)", () => {
  assert.deepEqual(portalAccess(base, true, now), { state: "invited", line: "Not signed in yet" });
  // Picked a password from a reset link but hasn't signed in since.
  assert.deepEqual(portalAccess({ ...base, mustChangePassword: false }, true, now), { state: "invited", line: "Not signed in yet" });
});

test("a used login stays Invited until they pick a password, and says when it was last seen", () => {
  // Signed in on the starting password but never picked their own.
  assert.deepEqual(portalAccess({ ...base, lastSignInAt: new Date("2026-10-22T15:00:00Z") }, true, now), {
    state: "invited",
    line: "Last seen yesterday",
  });
  // Staff reset the password of a login in use for weeks: never "Not signed in yet".
  assert.deepEqual(portalAccess({ ...base, lastSeenAt: new Date("2026-10-02T15:00:00Z") }, true, now), {
    state: "invited",
    line: "Last seen Oct 2",
  });
});

test("an active login says when it was last seen, in Buffalo days", () => {
  const seen = (iso: string) => portalAccess({ ...base, mustChangePassword: false, lastSeenAt: new Date(iso) }, true, now).line;
  assert.equal(seen("2026-10-23T13:00:00Z"), "Last seen today");
  // 11pm Eastern on the 22nd is the 23rd in UTC.
  assert.equal(seen("2026-10-23T03:00:00Z"), "Last seen yesterday");
  assert.equal(seen("2026-10-21T15:00:00Z"), "Last seen 2d ago");
  assert.equal(seen("2026-10-17T15:00:00Z"), "Last seen 6d ago");
  assert.equal(seen("2026-10-16T15:00:00Z"), "Last seen Oct 16");
  assert.equal(seen("2025-12-30T15:00:00Z"), "Last seen Dec 30, 2025");
  // A clock a little ahead never reads as the future.
  assert.equal(seen("2026-10-23T18:05:00Z"), "Last seen today");
  // The later of last sign-in and last seen.
  const both = portalAccess(
    { ...base, mustChangePassword: false, lastSignInAt: new Date("2026-10-22T15:00:00Z"), lastSeenAt: new Date("2026-10-20T15:00:00Z") },
    true,
    now,
  );
  assert.deepEqual(both, { state: "active", line: "Last seen yesterday" });
});

test("removed access or an inactive contact reads Access off (BCONTRACT-027)", () => {
  const used = { ...base, mustChangePassword: false, lastSeenAt: new Date("2026-10-23T13:00:00Z") };
  assert.deepEqual(portalAccess({ ...used, status: "DISABLED" }, true, now), { state: "off", line: null });
  assert.deepEqual(portalAccess(used, false, now), { state: "off", line: null });
  assert.deepEqual(portalAccess({ ...used, status: "DISABLED" }, false, now), { state: "off", line: null });
});
