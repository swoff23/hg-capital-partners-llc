import test from "node:test";
import assert from "node:assert/strict";
import { NO_NOTICE, dateChange, dateChangeText, hasNotice, noticeCount, sendBackStands, type DateEvent, type JobDates } from "./job-notice";

const due = (from: string | null, to: string | null, by: string | null = "Connor"): DateEvent => ({ kind: "DUE", from, to, by });
const visit = (from: string | null, to: string | null, by: string | null = "Connor"): DateEvent => ({ kind: "SCHEDULED", from, to, by });
const status = (from: string, to: string, by: string | null = null): DateEvent => ({ kind: "STATUS", from, to, by });

const job = (over: Partial<JobDates>): JobDates => ({ status: "IN_PROGRESS", due: null, scheduled: null, ...over });

test("a moved due date reads from the day before to the day after, and who", () => {
  const c = dateChange(job({ due: "2026-10-30" }), [due("2026-10-29", "2026-10-30")]);
  assert.deepEqual(c, { kind: "moved", visit: false, from: "2026-10-29", to: "2026-10-30", by: "Connor" });
  assert.equal(dateChangeText(c!, "2026-10-26"), "Due date moved to Fri, Oct 30 (was Thu, Oct 29)");
});

test("the words are Due date and Visit, never target", () => {
  const a = dateChange(job({ due: "2026-10-30" }), [due("2026-10-29", "2026-10-30")])!;
  const b = dateChange(job({ status: "SCHEDULED", scheduled: "2026-10-30" }), [visit("2026-10-29", "2026-10-30")])!;
  for (const c of [a, b]) assert.doesNotMatch(dateChangeText(c, "2026-10-26"), /target/i);
  assert.match(dateChangeText(b, "2026-10-26"), /^Visit moved to Fri, Oct 30 \(was Thu, Oct 29\)$/);
});

test("a date set where there was none, and one cleared", () => {
  const set = dateChange(job({ due: "2026-10-30" }), [due(null, "2026-10-30")])!;
  assert.equal(set.kind, "set");
  assert.equal(dateChangeText(set, "2026-10-26"), "Due date set to Fri, Oct 30");
  const cleared = dateChange(job({ due: null }), [due("2026-10-29", null)])!;
  assert.equal(cleared.kind, "cleared");
  assert.equal(dateChangeText(cleared, "2026-10-26"), "Due date cleared (was Thu, Oct 29)");
});

test("several moves in a row read as one, from the first day to the last", () => {
  const c = dateChange(job({ due: "2026-11-02" }), [due("2026-10-29", "2026-10-30"), due("2026-10-30", "2026-11-01", "Pieter"), due("2026-11-01", "2026-11-02", "Pieter")])!;
  assert.deepEqual([c.from, c.to, c.by], ["2026-10-29", "2026-11-02", "Pieter"]);
});

test("a date moved away and back is no change", () => {
  assert.equal(dateChange(job({ due: "2026-10-29" }), [due("2026-10-29", "2026-10-30"), due("2026-10-30", "2026-10-29")]), null);
});

test("no date events, no notice", () => {
  assert.equal(dateChange(job({ due: "2026-10-29" }), []), null);
});

test("the due date moving while the job is Scheduled isn't something the contractor sees: the visit is their date", () => {
  const now = job({ status: "SCHEDULED", due: "2026-11-05", scheduled: "2026-10-27" });
  assert.equal(dateChange(now, [due("2026-10-29", "2026-11-05")]), null);
});

test("starting your own Scheduled job swaps the visit for the due date, and that is not HG moving it", () => {
  const now = job({ status: "IN_PROGRESS", due: "2026-10-30", scheduled: "2026-10-27" });
  assert.equal(dateChange(now, [status("SCHEDULED", "IN_PROGRESS")]), null);
});

test("a date edit is read against the status the job had at that moment", () => {
  // Visit moved 27 -> 28 while Scheduled, then the contractor started the job: the visit move is what they missed.
  const now = job({ status: "IN_PROGRESS", due: "2026-10-30", scheduled: "2026-10-28" });
  const c = dateChange(now, [visit("2026-10-27", "2026-10-28"), status("SCHEDULED", "IN_PROGRESS")])!;
  assert.deepEqual([c.visit, c.from, c.to], [true, "2026-10-27", "2026-10-28"]);
  assert.equal(dateChangeText(c, "2026-10-26"), "Visit moved to Wed, Oct 28 (was Tue, Oct 27)");
});

test("a move of a different kind after a status change starts its own notice", () => {
  const now = job({ status: "IN_PROGRESS", due: "2026-11-01", scheduled: "2026-10-28" });
  const c = dateChange(now, [visit("2026-10-27", "2026-10-28"), status("SCHEDULED", "IN_PROGRESS"), due("2026-10-30", "2026-11-01")])!;
  assert.deepEqual([c.visit, c.from, c.to], [false, "2026-10-30", "2026-11-01"], "the due date move is the latest thing they can see");
});

test("a status or date value that isn't one is skipped, not trusted", () => {
  const now = job({ due: "2026-10-30" });
  assert.deepEqual(dateChange(now, [status("???", "IN_PROGRESS"), due("2026-10-29", "2026-10-30")])?.to, "2026-10-30");
  assert.equal(dateChange(now, [due("not a day", "2026-10-30")])?.kind, "set");
});

test("a send back stands while the job is in progress and no Mark done has come after it", () => {
  const sent = new Date("2026-10-26T14:00:00Z");
  const before = new Date("2026-10-26T12:00:00Z");
  const after = new Date("2026-10-26T15:00:00Z");
  assert.equal(sendBackStands("IN_PROGRESS", sent, before), true, "marked done, then sent back");
  assert.equal(sendBackStands("IN_PROGRESS", sent, null), true, "no Mark done on record");
  assert.equal(sendBackStands("IN_PROGRESS", sent, after), false, "marked done again since");
  assert.equal(sendBackStands("REVIEW", sent, before), false, "back in Review");
  assert.equal(sendBackStands("DONE", sent, before), false);
  assert.equal(sendBackStands("IN_PROGRESS", null, before), false, "never sent back");
});

test("the notice is empty until something is in it", () => {
  assert.equal(hasNotice(NO_NOTICE), false);
  assert.equal(hasNotice({ ...NO_NOTICE, notes: { by: null } }), true);
  assert.equal(hasNotice({ ...NO_NOTICE, date: { text: "Due date moved", by: "Connor" } }), true);
});

test("My jobs counts the date and the notes once each", () => {
  const moved = dateChange(job({ due: "2026-10-30" }), [due("2026-10-29", "2026-10-30")]);
  assert.equal(noticeCount(moved, true), 2);
  assert.equal(noticeCount(moved, false), 1);
  assert.equal(noticeCount(null, false), 0);
});
