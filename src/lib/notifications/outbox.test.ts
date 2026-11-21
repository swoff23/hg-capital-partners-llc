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
  assert.match(code, /liveItems\(taskId, parseItems\(claimed\.items\)/);
});

test("it reads in one query per row, scoped to the row's task, only for items that name events", () => {
  assert.equal((code.match(/taskEvent\.findMany/g) ?? []).length, 1);
  assert.match(code, /where: \{ id: \{ in: ids \}, taskId \}/);
  assert.match(code, /if \(ids\.length === 0\) return \{ items: stored, photosByEvent: new Map\(\) \};/, "a row of old items sends as stored, with no read");
  // A file taken off a comment is not counted.
  assert.match(code, /attachments: \{ where: \{ deletedAt: null \}/);
});

test("a claimed row with nothing left to say closes with the second decision's reason, never as an empty email", () => {
  // claimedRowVerdict (content.test.ts) answers "no task", "draft" or "nothing to send"; the run writes that and moves on.
  // It also gets whether the home needs 24 hours' notice (contractor-scheduled-date.md, Q6), read before it.
  assert.match(code, /const second = claimedRowVerdict\(\{\s*audience: delivery\.audience,\s*items: live\.items,\s*job: fresh,\s*hasAccess: !!accessRow,\s*needsNotice: !!jobAccess\?\.needsNotice,\s*today: todayYmdEastern\(now\),\s*\}\);\s*if \(!second\.send\) \{\s*await prisma\.notificationOutbox\.updateMany\(\{ where: \{ id: row\.id \}, data: \{ sentAt: now, lastError: second\.reason \} \}\);\s*result\.skipped\+\+;\s*continue;/);
  // The job and the access it judges are read after the claim, so an Add undone in between is seen.
  const drain = code.slice(code.indexOf("export async function drainDue"));
  assert.ok(drain.indexOf("await claim(row.id, now)") < drain.indexOf("prisma.task.findUnique({ where: { id: taskId }"));
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
  // closed by the second decision (the task gone, a draft, nothing to send), sent, refused for Resend's limits,
  // failed: each by the row's id alone.
  assert.equal(writes.length, 4);
  for (const w of writes) assert.match(w, /where: \{ id: row\.id \}$/);
  // A count of 0 is not an error: nothing reads it, and the loop goes on to the next row.
  assert.doesNotMatch(drain, /const \{ count \} = await prisma\.notificationOutbox\.updateMany/);
  // The sent count is the email that went out, whether or not its row is still there.
  assert.match(drain, /if \(res\.ok\) \{\s*await prisma\.notificationOutbox\.updateMany\(\{ where: \{ id: row\.id \}, data: \{ sentAt: new Date\(\), lastError: null \} \}\);\s*result\.sent\+\+;/);
});

// docs/specs/contractor-email-switch.md: a line still waiting when Job emails goes off is dropped by the run.
test("the drain reads the contractor's Job emails switch with the row and closes a refused row unsent, with the reason", () => {
  assert.match(code, /portalAccount: \{ select: \{ email: true, status: true, jobEmails: true \} \}/);
  // The first decision's refusal (content.test.ts dueRowVerdict: "emails off", "draft", "no task") is the row's
  // lastError, so nothing reads it as emailed, and the row is never claimed.
  assert.match(code, /const first = dueRowVerdict\(row\);\s*if \(!first\.send\) \{\s*await closeUnsent\(row\.id, now, first\.reason\);\s*result\.skipped\+\+;\s*continue;\s*\}/);
  const drain = code.slice(code.indexOf("export async function drainDue"));
  assert.ok(drain.indexOf("dueRowVerdict(row)") < drain.indexOf("await claim(row.id, now)"), "decided before the claim");
});
