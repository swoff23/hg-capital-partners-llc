import test from "node:test";
import assert from "node:assert/strict";
import { POST_UNDO_GRACE_MS, POST_UNDO_MS, undoWindowOpen } from "./job-view";

// The contractor's "3 photos posted · Undo" (uploads 2.7, question 5): the
// toast stays five seconds, and the server takes the Undo for a little longer
// than that, so a tap on a weak signal still lands. After it, the update stays.
// job-uploads.ts undoJobPost reads this rule; it talks to the database, so the
// rule lives here where it can be run.

const POSTED = new Date("2026-10-26T15:00:00.000Z");
const after = (ms: number) => new Date(POSTED.getTime() + ms);

test("the toast's window is five seconds, as every Undo in the app", () => {
  assert.equal(POST_UNDO_MS, 5_000);
});

test("an Undo inside the toast's five seconds is accepted", () => {
  assert.equal(undoWindowOpen(POSTED, after(0)), true);
  assert.equal(undoWindowOpen(POSTED, after(1_200)), true);
  assert.equal(undoWindowOpen(POSTED, after(POST_UNDO_MS)), true);
});

test("a slow tap still lands: the server allows the grace after the toast", () => {
  assert.equal(undoWindowOpen(POSTED, after(POST_UNDO_MS + 1)), true);
  assert.equal(undoWindowOpen(POSTED, after(POST_UNDO_MS + POST_UNDO_GRACE_MS)), true, "inclusive at the edge");
});

test("past the window the update stays, and Undo is refused", () => {
  assert.equal(undoWindowOpen(POSTED, after(POST_UNDO_MS + POST_UNDO_GRACE_MS + 1)), false);
  assert.equal(undoWindowOpen(POSTED, after(10 * 60_000)), false);
  assert.equal(undoWindowOpen(POSTED, after(24 * 60 * 60_000)), false);
});

test("a post whose time reads slightly ahead of the server's clock still counts", () => {
  assert.equal(undoWindowOpen(after(2_000), POSTED), true);
});

test("the time can arrive as an ISO string, and nonsense is never undoable", () => {
  assert.equal(undoWindowOpen(POSTED.toISOString(), after(3_000)), true);
  assert.equal(undoWindowOpen(POSTED.toISOString(), after(60_000)), false);
  assert.equal(undoWindowOpen("not a time", after(1_000)), false);
});

test("the grace is longer than the toast but far shorter than the 10-minute email bundle", () => {
  assert.ok(POST_UNDO_GRACE_MS > 0);
  assert.ok(POST_UNDO_MS + POST_UNDO_GRACE_MS < 10 * 60_000);
});
