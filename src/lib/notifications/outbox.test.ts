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

test("a quota refusal pushes every due row back in one id-ordered statement that never waits on a row a write holds", () => {
  // An unordered updateMany across every task's rows could hold one row a queueing write wants while waiting on one
  // it holds (40P01). Id order and SKIP LOCKED: it never waits, so it can't be one side of a deadlock.
  assert.doesNotMatch(code, /notificationOutbox\.updateMany\(\{\s*where: \{ sentAt: null, sendAfter/, "no unordered update across rows");
  assert.match(code, /if \(failure === "quota"\) \{\s*await pushBackDue\(now, until\);/);
  const push = code.slice(code.indexOf("async function pushBackDue"));
  assert.match(
    push,
    /UPDATE "NotificationOutbox" SET "sendAfter" = [^;]*WHERE "id" IN \(\s*SELECT "id" FROM "NotificationOutbox"\s*WHERE "sentAt" IS NULL AND "sendAfter" <= [^;]*ORDER BY "id"\s*FOR UPDATE SKIP LOCKED\s*\)/,
  );
});

test("every write to a claimed row is an updateMany by id, so a row deleteTask's cascade removed mid-send never fails the run", () => {
  // An update on a missing row throws P2025, and drainDue would reject with every row after it left for the next run.
  assert.doesNotMatch(code, /notificationOutbox\.update\(/, "no update that needs the row to be there");
  const drain = code.slice(code.indexOf("export async function drainDue"));
  const writes = drain.match(/notificationOutbox\.updateMany\(\{\s*where: \{ [^}]*\}/g) ?? [];
  // nothing to send, sent, refused for Resend's limits, failed: each by the row's id alone.
  assert.equal(writes.length, 4);
  for (const w of writes) assert.match(w, /where: \{ id: row\.id \}$/);
  // A count of 0 is not an error: nothing reads it, and the loop goes on to the next row.
  assert.doesNotMatch(drain, /const \{ count \} = await prisma\.notificationOutbox\.updateMany/);
  // The sent count is the email that went out, whether or not its row is still there.
  assert.match(drain, /if \(res\.ok\) \{\s*await prisma\.notificationOutbox\.updateMany\(\{ where: \{ id: row\.id \}, data: \{ sentAt: new Date\(\), lastError: null \} \}\);\s*result\.sent\+\+;/);
});
