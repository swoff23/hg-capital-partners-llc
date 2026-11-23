import test from "node:test";
import assert from "node:assert/strict";
import { REMINDER_HOUR, REMINDER_STATUSES, canonicalReminder, easternHour, inReminderHour, inTellWindow, reminderFor, reminderStillTrue } from "./reminder-rules";

// docs/specs/emails-redesign.md, Q8 and its drawing (_private/mockups/email-q8-morning-timing.svg, option A at 7 am).

test("the morning emails go out through the 7 o'clock hour in Buffalo, in daylight and standard time", () => {
  assert.equal(REMINDER_HOUR, 7);
  assert.equal(easternHour(new Date("2026-07-01T11:00:00Z")), 7); // EDT
  assert.equal(easternHour(new Date("2026-11-23T12:00:00Z")), 7); // EST
  assert.ok(inReminderHour(new Date("2026-11-23T12:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T11:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T13:00:00Z")));
});

const job = (j: Partial<Parameters<typeof reminderFor>[0]>) => ({ status: "OPEN" as const, due: null, scheduled: null, needsNotice: false, ...j });
const kind = (j: Partial<Parameters<typeof reminderFor>[0]>, today = "2026-11-24") => reminderFor(job(j), today)?.kind ?? null;

test("the drawing's week: a day of Thu 26 at a notice home, and a job with no day due Fri 27", () => {
  // New went Sun 22. Has a day: Tell the tenant Tue 24, Today Thu 26, Still open Fri 27 only if not started, then nothing.
  const dayed = { status: "SCHEDULED" as const, scheduled: "2026-11-26", due: "2026-11-27", needsNotice: true, newOn: "2026-11-22" };
  const week = ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
  assert.deepEqual(week.map((d) => kind(dayed, d)), [null, null, "TELL_TENANT", null, "SCHEDULED_TODAY", "STILL_OPEN", null]);
  // No day yet: No day yet Tue 24 (the second morning after New), Due today Fri 27, Due yesterday Sat 28.
  const undated = { due: "2026-11-27", newOn: "2026-11-22" };
  assert.deepEqual(week.map((d) => kind(undated, d)), [null, null, "NO_DAY", null, "NO_DAY", "DUE_TODAY", "OVERDUE"]);
  // (Thu 26 is the morning before Due; core.ts queueDueReminder keeps No day yet to once, so Tue's holds it back.)
});

test("nothing on hold, in progress or in review; Due today and Due yesterday only while no day is set", () => {
  assert.deepEqual(REMINDER_STATUSES, ["OPEN", "SCHEDULED"]);
  assert.equal(kind({ status: "WAITING", due: "2026-11-24" }), null);
  assert.equal(kind({ status: "IN_PROGRESS", due: "2026-11-24" }), null);
  assert.equal(kind({ status: "REVIEW", due: "2026-11-24" }), null);
  assert.equal(kind({ due: "2026-11-24" }), "DUE_TODAY");
  assert.equal(kind({ due: "2026-11-23" }), "OVERDUE");
  // Once a day is set, their day leads: no Due emails.
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-28", due: "2026-11-24" }), null);
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-28", due: "2026-11-23" }), null);
  // Across a month's end.
  assert.equal(kind({ due: "2026-11-30" }, "2026-12-01"), "OVERDUE");
});

test("Tell the tenant only at a home that needs notice, two mornings out; Today and Still open at any home", () => {
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-26", needsNotice: true }), "TELL_TENANT");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-26" }), null);
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-25", needsNotice: true }), null, "the morning before is not its morning");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-24" }), "SCHEDULED_TODAY");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-23" }), "STILL_OPEN");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-22" }), null, "once, the morning after");
  assert.deepEqual(reminderFor(job({ status: "SCHEDULED", scheduled: "2026-11-24" }), "2026-11-24"), { kind: "SCHEDULED_TODAY", day: "2026-11-24" });
});

test("No day yet: once, the second morning after New, or the morning before Due if sooner; never the morning of New", () => {
  assert.equal(kind({ newOn: "2026-11-22" }), "NO_DAY");
  assert.equal(kind({ newOn: "2026-11-23" }), null);
  assert.equal(kind({ newOn: "2026-11-23", due: "2026-11-25" }), "NO_DAY", "Due tomorrow comes first");
  assert.equal(kind({ newOn: "2026-11-24", due: "2026-11-25" }), null, "New went this morning");
  assert.equal(kind({ due: "2026-11-25" }), "NO_DAY", "New's day unknown: the morning before Due");
  assert.equal(kind({}), null);
  assert.deepEqual(reminderFor(job({ newOn: "2026-11-22" }), "2026-11-24"), { kind: "NO_DAY", day: "2026-11-24" });
});

test("a line queued earlier is still true as it sends only while the job is where it found it", () => {
  const today = "2026-11-24";
  const sched = { status: "SCHEDULED" as const, due: "2026-11-27", scheduled: "2026-11-26", needsNotice: true };
  assert.ok(reminderStillTrue({ kind: "TELL_TENANT", due: "2026-11-26" }, sched, today));
  assert.ok(!reminderStillTrue({ kind: "TELL_TENANT", due: "2026-11-26" }, { ...sched, needsNotice: false }, today));
  assert.ok(!reminderStillTrue({ kind: "TELL_TENANT", due: "2026-11-26" }, { ...sched, scheduled: "2026-11-27" }, today));
  assert.ok(reminderStillTrue({ kind: "SCHEDULED_TOMORROW", due: "2026-11-25" }, { ...sched, scheduled: "2026-11-25" }, today), "the old heads-up reads as Tell the tenant");
  assert.ok(reminderStillTrue({ kind: "SCHEDULED_TODAY", due: today }, { ...sched, scheduled: today }, today));
  assert.ok(reminderStillTrue({ kind: "SCHEDULED_TODAY", due: today }, { ...sched, status: "IN_PROGRESS", scheduled: null, planned: today }, today), "started this morning");
  assert.ok(!reminderStillTrue({ kind: "SCHEDULED_TODAY", due: today }, { ...sched, status: "WAITING", scheduled: null }, today));
  assert.ok(reminderStillTrue({ kind: "STILL_OPEN", due: "2026-11-23" }, { ...sched, scheduled: "2026-11-23" }, today));
  assert.ok(!reminderStillTrue({ kind: "STILL_OPEN", due: "2026-11-23" }, { ...sched, status: "IN_PROGRESS", scheduled: null }, today));
  const open = { status: "OPEN" as const, due: today, scheduled: null, needsNotice: false };
  assert.ok(reminderStillTrue({ kind: "NO_DAY", due: today }, open, today));
  assert.ok(!reminderStillTrue({ kind: "NO_DAY", due: today }, sched, today));
  assert.ok(reminderStillTrue({ kind: "DUE_TODAY", due: today }, open, today));
  assert.ok(!reminderStillTrue({ kind: "DUE_TODAY", due: today }, { ...open, status: "IN_PROGRESS" }, today));
  assert.ok(!reminderStillTrue({ kind: "DUE_TODAY", due: today }, open, "2026-11-25"));
  assert.ok(reminderStillTrue({ kind: "OVERDUE", due: "2026-11-23" }, { ...open, due: "2026-11-23" }, today));
  assert.ok(reminderStillTrue({ kind: "DUE_TOMORROW", due: "2026-11-25" }, { ...open, due: "2026-11-25" }, today));
  assert.equal(canonicalReminder("SCHEDULED_TOMORROW"), "TELL_TENANT");
  assert.equal(canonicalReminder("DUE_TOMORROW"), "NO_DAY");
  assert.equal(canonicalReminder("OVERDUE"), "OVERDUE");
});

test("Tell the tenant's window runs from two mornings before the day through the day itself", () => {
  assert.ok(inTellWindow("2026-11-24", "2026-11-24"));
  assert.ok(inTellWindow("2026-11-25", "2026-11-24"));
  assert.ok(inTellWindow("2026-11-26", "2026-11-24"));
  assert.ok(!inTellWindow("2026-11-27", "2026-11-24"));
  assert.ok(!inTellWindow("2026-11-23", "2026-11-24"));
});
