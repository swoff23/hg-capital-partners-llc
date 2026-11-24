import test from "node:test";
import assert from "node:assert/strict";
import { droppedLines, jobSummary, viewHref } from "./lines";

test("To review keeps the bare path; the other views carry ?view=", () => {
  assert.equal(viewHref("review"), "/invoices");
  assert.equal(viewHref("pay"), "/invoices?view=pay");
  assert.equal(viewHref("paid"), "/invoices?view=paid");
});

test("the cap line reads in full and short, and agrees with one", () => {
  assert.deepEqual(droppedLines(4), {
    long: "4 invoice emails over today's limit weren't saved.",
    short: "4 emails over the limit weren't saved.",
  });
  assert.equal(droppedLines(1).long, "1 invoice email over today's limit wasn't saved.");
  assert.equal(droppedLines(1).short, "1 email over the limit wasn't saved.");
  assert.ok(droppedLines(9).short.length <= 40);
});

test("a row names its first job and counts the rest", () => {
  assert.deepEqual(jobSummary([]), { first: null, more: 0 });
  assert.deepEqual(jobSummary([{ taskId: "a", title: "Roof patch", place: "9 Birch Rd" }, { taskId: "b", title: "Gutters" }]), {
    first: { title: "Roof patch", place: "9 Birch Rd" },
    more: 1,
  });
  assert.deepEqual(jobSummary([{ taskId: null, title: "Old job" }]).first, { title: "Old job", place: null });
});
