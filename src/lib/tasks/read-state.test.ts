import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { READ_STATE_SINCE, seenBaseline, unreadTaskIds } from "./read-state";

test("READ_STATE_SINCE is one fixed instant, not the time the code loaded", () => {
  assert.ok(READ_STATE_SINCE instanceof Date);
  assert.ok(!Number.isNaN(READ_STATE_SINCE.getTime()));
  assert.equal(READ_STATE_SINCE.toISOString(), "2026-10-27T04:00:00.000Z");
});

test("seenBaseline: a partner with no row has seen everything before the release", () => {
  assert.equal(seenBaseline(null), READ_STATE_SINCE);
  assert.equal(seenBaseline(undefined), READ_STATE_SINCE);
  // An event from before the release is at or before the baseline: seen.
  const before = new Date(READ_STATE_SINCE.getTime() - 60_000);
  assert.ok(before.getTime() <= seenBaseline(null).getTime());
});

test("seenBaseline: a row's lastSeenAt is the baseline, so the dot and the divider agree", () => {
  const opened = new Date("2026-11-03T15:00:00.000Z");
  assert.equal(seenBaseline(opened), opened);
});

test("unreadTaskIds answers an empty set until the unread rule lands", async () => {
  const ids = await unreadTaskIds("u-connor", ["t1", "t2"]);
  assert.ok(ids instanceof Set);
  assert.equal(ids.size, 0);
});

test("read-state.ts never stamps the Task row, so opening a task can't stall the Asana delta", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "read-state.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\btask\.(update|updateMany|upsert)\b/);
  assert.doesNotMatch(code, /editStamp|appEditedAt/);
});
