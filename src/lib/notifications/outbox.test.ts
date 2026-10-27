import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/*
 * The drain talks to the database and Resend, so its read-back is checked
 * where it can be: what reconcileItems does with each item is in
 * content.test.ts; here, that the drain calls it at the right moment and
 * reads the right rows (activity 2.5).
 */

const source = fs.readFileSync(path.join(import.meta.dirname, "outbox.ts"), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the drain re-reads each item's event after it claims the row, not before", () => {
  const claimAt = code.indexOf("await claim(row.id, now)");
  const liveAt = code.indexOf("await liveItems(");
  assert.ok(claimAt > 0 && liveAt > claimAt, "read the events from the claimed items");
  // Claimed rows are the ones the claim returned: what is read is what is sent.
  assert.match(code, /liveItems\(row\.taskId, parseItems\(claimed\.items\)/);
});

test("it reads in one query per row, scoped to the row's task, only for items that name events", () => {
  assert.equal((code.match(/taskEvent\.findMany/g) ?? []).length, 1);
  assert.match(code, /where: \{ id: \{ in: ids \}, taskId \}/);
  assert.match(code, /if \(ids\.length === 0\) return stored;/, "a row of old items sends as stored, with no read");
  // A file taken off a comment is not counted.
  assert.match(code, /attachments: \{ where: \{ deletedAt: null \}/);
});

test("a row whose items all drop closes as 'nothing to send', never as an empty email", () => {
  assert.match(code, /items\.length === 0[\s\S]{0,200}lastError: "nothing to send"/);
});

test("the drain never deletes or rewrites a row to retract a line", () => {
  assert.doesNotMatch(code, /notificationOutbox\.delete/);
  assert.doesNotMatch(code, /items:\s*\{?\s*(set|push)/);
  assert.doesNotMatch(code, /UPDATE "NotificationOutbox"[\s\S]{0,80}"items" =/, "only the claim and the failure paths write the row");
});
