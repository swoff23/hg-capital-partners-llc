import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST_UNDO_GRACE_MS, POST_UNDO_MS, undoWindowOpen } from "@/lib/portal/job-view";
import { TOAST_ACTION_MS, TOAST_MS, toastMs } from "./toast-time";

// Design call 7 (Nov 14): a toast with a button stays 8 seconds, one without stays 5, and the three timers that
// used to copy the old 5 seconds read the same number, so Undo never shows after the thing it undoes is gone.

const src = (...path: string[]) => readFileSync(join(__dirname, "..", ...path), "utf8");

test("a toast with a button stays 8 seconds, one without stays 5", () => {
  assert.equal(TOAST_MS, 5_000);
  assert.equal(TOAST_ACTION_MS, 8_000);
  assert.equal(toastMs(true), TOAST_ACTION_MS);
  assert.equal(toastMs(false), TOAST_MS);
});

test("the toast reads its time from here, by whether it has a button, and keeps no number of its own", () => {
  const toast = src("components", "toast.tsx");
  assert.match(toast, /const stays = toastMs\(item\.action !== undefined\);/);
  assert.match(toast, /setTimeout\(\(\) => dismiss\(id\), stays\)/);
  // The timer restarts when the time changes, as it does for a replacement under the same key.
  assert.match(toast, /\}, \[held, dismiss, id, version, stays\]\);/);
  assert.doesNotMatch(toast, /\b5_?000\b|\b8_?000\b|DURATION_MS/);
});

test("a photo taken out of a reply is deleted just after its toast ends, never before", () => {
  const uploader = src("components", "media-uploader.tsx");
  assert.match(uploader, /const UNDO_MS = TOAST_ACTION_MS;/);
  assert.match(uploader, /\}, UNDO_MS \+ 300\);/);
  assert.doesNotMatch(uploader, /UNDO_MS = \d/);
});

test("a replaced front photo is kept a beat longer than its toast, so Undo in the last second still finds it", () => {
  const photo = src("app", "(app)", "properties", "[id]", "property-photo.tsx");
  const keep = photo.match(/const KEEP_OLD_MS = TOAST_ACTION_MS \+ ([\d_]+);/);
  assert.ok(keep, "KEEP_OLD_MS is built from the toast's time");
  assert.ok(Number(keep[1].replace(/_/g, "")) >= 1_000, "at least a second past the toast");
  assert.match(photo, /\}, KEEP_OLD_MS\);/);
});

test("the server takes a contractor's photos-posted Undo for as long as the toast shows it, plus the grace", () => {
  assert.equal(POST_UNDO_MS, TOAST_ACTION_MS);
  assert.match(src("lib", "portal", "job-view.ts"), /export const POST_UNDO_MS = TOAST_ACTION_MS;/);
  const posted = new Date("2026-11-14T15:00:00.000Z");
  const after = (ms: number) => new Date(posted.getTime() + ms);
  // The last moment the toast is up: 5 seconds was the old window, and 8 is inside the new one without the grace.
  assert.equal(undoWindowOpen(posted, after(TOAST_ACTION_MS)), true);
  assert.equal(undoWindowOpen(posted, after(TOAST_ACTION_MS + POST_UNDO_GRACE_MS)), true);
  assert.equal(undoWindowOpen(posted, after(TOAST_ACTION_MS + POST_UNDO_GRACE_MS + 1)), false);
});
