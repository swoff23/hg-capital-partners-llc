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
  assert.match(code, /if \(ids\.length === 0\) return \{ items: stored, photosByEvent: new Map\(\) \};/, "a row of old items sends as stored, with no read");
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
  // The task gone at the claim, nothing to send, an invoice row's wait and its read after the claim, and in the shared
  // settle step sent, refused for Resend's limits and failed: each by the row's id alone (an unclaimed invoice row's
  // wait also only while it's unsent).
  assert.equal(writes.length, 7);
  for (const w of writes) assert.match(w, /where: \{ id: (row\.id|rowId)(, sentAt: null)? \}$/);
  // A count of 0 is not an error: nothing reads it, and the loop goes on to the next row.
  assert.doesNotMatch(drain, /const \{ count \} = await prisma\.notificationOutbox\.updateMany/);
  // The sent count is the email that went out, whether or not its row is still there.
  assert.match(drain, /if \(res\.ok\) \{\s*await prisma\.notificationOutbox\.updateMany\(\{ where: \{ id: rowId \}, data: \{ sentAt: new Date\(\), lastError: null \} \}\);\s*result\.sent\+\+;/);
});

// docs/specs/contractor-email-switch.md: a line still waiting when Job emails goes off is dropped by the run.
test("the drain reads the contractor's Job emails switch with the row and closes a refused row unsent, with the reason", () => {
  assert.match(code, /portalAccount: \{ select: \{ email: true, status: true, jobEmails: true \} \}/);
  // deliveryFor's refusal (content.test.ts: "emails off") is the row's lastError, so nothing reads it as emailed.
  assert.match(code, /await closeUnsent\(row\.id, now, !row\.task \? "no task" : delivery\.ok \? "no recipient" : delivery\.reason\)/);
});

// docs/contractor-invoices-plan.md, 5.3: invoice rows carry no task, so they take their own branch before the task
// rows' "no task" close, and never read a task or a TaskAccess row.
test("an invoice row takes its own branch before the task checks, and is read again after its claim", () => {
  const drain = code.slice(code.indexOf("export async function drainDue"));
  const branch = drain.indexOf("if (isInvoiceRow(row))");
  assert.ok(branch > 0 && branch < drain.indexOf("const contractorHasAccess"), "the invoice branch comes before the task checks");
  const body = drain.slice(branch, drain.indexOf("const contractorHasAccess"));
  assert.doesNotMatch(body, /task\.findUnique|taskAccess|deliveryFor/);
  const claimAt = body.indexOf("await claim(row.id, now)");
  assert.ok(claimAt > 0 && body.indexOf("invoiceEmailFor(prisma, { ...row, items: claimed.items }") > claimAt, "re-read after the claim");
  // No reply token on a Paid email (M15).
  assert.doesNotMatch(body, /replyTo|mintJobLink/);
  // A skip planned before the claim closes only while the row holds the items it was planned from, so a bundle line
  // or a re-pay queued since stays open (invoices/notify.ts closeUnclaimedInvoiceRow; notify.pg.test.ts runs it).
  assert.doesNotMatch(body, /closeUnsent\(/);
  assert.match(body, /closeUnclaimedInvoiceRow\(prisma, row, now, plan\.reason\)/);
});
