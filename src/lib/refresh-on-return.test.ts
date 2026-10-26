import test from "node:test";
import assert from "node:assert/strict";
import { MIN_GAP_MS, STALE_AFTER_MS, refreshHeld, shouldRefresh, type ReturnState } from "./refresh-on-return";

const base: ReturnState = { pathname: "/tasks", loadedDay: "2026-10-23", today: "2026-10-23", sinceLastMs: 10 * 60_000, online: true };

test("visible: refreshes only after more than a minute hidden", () => {
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: STALE_AFTER_MS + 1 }, base), true);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 3 * 60 * 60_000 }, base), true);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: STALE_AFTER_MS }, base), false);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 5_000 }, base), false);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 0 }, base), false);
});

test("online: the connection coming back refreshes", () => {
  assert.equal(shouldRefresh({ kind: "online" }, base), true);
});

test("pageshow: only a page restored from the back-forward cache refreshes", () => {
  assert.equal(shouldRefresh({ kind: "pageshow", persisted: true }, base), true);
  assert.equal(shouldRefresh({ kind: "pageshow", persisted: false }, base), false);
});

test("clock: refreshes only once the Eastern day has changed", () => {
  assert.equal(shouldRefresh({ kind: "clock" }, base), false);
  assert.equal(shouldRefresh({ kind: "clock" }, { ...base, today: "2026-10-24" }), true);
});

test("a new day refreshes on any return, however short the absence", () => {
  const nextDay = { ...base, today: "2026-10-24" };
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 2_000 }, nextDay), true);
  assert.equal(shouldRefresh({ kind: "pageshow", persisted: false }, nextDay), true);
});

test("two triggers from one return refresh once", () => {
  const justRefreshed = { ...base, sinceLastMs: MIN_GAP_MS - 1 };
  assert.equal(shouldRefresh({ kind: "online" }, justRefreshed), false);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 10 * 60_000 }, justRefreshed), false);
  assert.equal(shouldRefresh({ kind: "online" }, { ...base, sinceLastMs: MIN_GAP_MS }), true);
});

test("the property page holds off, so its open editors keep what's typed", () => {
  assert.equal(refreshHeld("/properties/cmtg25y4m0003jphsrpe7xpb8"), true);
  assert.equal(refreshHeld("/properties/cmtg25y4m0003jphsrpe7xpb8/"), true);
  assert.equal(refreshHeld("/properties"), false);
  assert.equal(refreshHeld("/tasks"), false);
  assert.equal(refreshHeld("/deals/abc"), false);
  // Apply builds its rows once from the playbook's items, so even a clean one waits.
  assert.equal(refreshHeld("/templates/abc/apply"), true);
  assert.equal(refreshHeld("/templates/abc"), false);
  const onProperty = { ...base, pathname: "/properties/abc", today: "2026-10-24" };
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 10 * 60_000 }, onProperty), false);
  assert.equal(shouldRefresh({ kind: "online" }, onProperty), false);
  assert.equal(shouldRefresh({ kind: "online" }, { ...base, pathname: "/properties" }), true);
});

test("offline: nothing refreshes until the connection is back", () => {
  const offline = { ...base, online: false };
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 60 * 60_000 }, offline), false);
  assert.equal(shouldRefresh({ kind: "pageshow", persisted: true }, offline), false);
  assert.equal(shouldRefresh({ kind: "clock" }, { ...offline, today: "2026-10-24" }), false);
  assert.equal(shouldRefresh({ kind: "online" }, offline), false);
  // Back online after the skipped return, the "online" trigger catches up.
  assert.equal(shouldRefresh({ kind: "online" }, base), true);
});

test("a dirty draft holds the refresh on any page, instead of a list of pages", () => {
  // The move-in form editor and the CapEx rules aren't named anywhere any more.
  for (const pathname of ["/settings/move-in-form", "/settings", "/tasks", "/deals/abc"]) {
    assert.equal(refreshHeld(pathname), false, pathname);
    const clean = { ...base, pathname };
    assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 10 * 60_000 }, clean), true, pathname);
    const dirty = { ...clean, unsaved: true };
    assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 10 * 60_000 }, dirty), false, pathname);
    assert.equal(shouldRefresh({ kind: "online" }, dirty), false, pathname);
    assert.equal(shouldRefresh({ kind: "pageshow", persisted: true }, dirty), false, pathname);
  }
});

test("a new day doesn't refresh over unsaved work either, and the next return asks again", () => {
  const dirtyNextDay = { ...base, today: "2026-10-24", unsaved: true };
  assert.equal(shouldRefresh({ kind: "clock" }, dirtyNextDay), false);
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 2_000 }, dirtyNextDay), false);
  // Saved or discarded: the hold lifts, and the day's change catches up.
  assert.equal(shouldRefresh({ kind: "visible", hiddenMs: 2_000 }, { ...dirtyNextDay, unsaved: false }), true);
});

test("an unsaved flag left out means nothing is held", () => {
  assert.equal(shouldRefresh({ kind: "online" }, base), true);
  assert.equal(shouldRefresh({ kind: "online" }, { ...base, unsaved: false }), true);
});
