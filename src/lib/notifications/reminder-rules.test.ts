import test from "node:test";
import assert from "node:assert/strict";
import { easternHour, inReminderHour, isSoon, reminderFor } from "./reminder-rules";

test("the reminders go out through the 8 o'clock hour in Buffalo, in daylight and standard time", () => {
  assert.equal(easternHour(new Date("2026-07-01T12:00:00Z")), 8); // EDT
  assert.equal(easternHour(new Date("2026-11-23T13:00:00Z")), 8); // EST
  assert.ok(inReminderHour(new Date("2026-11-23T13:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T12:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T14:00:00Z")));
});

const job = (j: Partial<Parameters<typeof reminderFor>[0]>) => ({ status: "OPEN" as const, due: null, scheduled: null, needsNotice: false, ...j });
const kind = (j: Partial<Parameters<typeof reminderFor>[0]>, today = "2026-11-23") => reminderFor(job(j), today)?.kind ?? null;

test("due today on the date, due yesterday the morning after, nothing otherwise", () => {
  assert.equal(kind({ due: "2026-11-23" }), "DUE_TODAY");
  assert.equal(kind({ due: "2026-11-22" }), "OVERDUE");
  assert.equal(kind({ due: "2026-11-21" }), null);
  assert.equal(kind({ due: "2026-11-24" }), null);
  assert.equal(kind({ due: null }), null);
  // Across a month's end.
  assert.equal(kind({ due: "2026-11-30" }, "2026-12-01"), "OVERDUE");
  // Only while it waits on them.
  assert.equal(kind({ due: "2026-11-23", status: "REVIEW" }), null);
  assert.equal(kind({ due: "2026-11-23", status: "IN_PROGRESS" }), "DUE_TODAY");
});

test("their scheduled day gets Scheduled today, only while Scheduled", () => {
  assert.deepEqual(reminderFor(job({ status: "SCHEDULED", scheduled: "2026-11-23", due: "2026-11-30" }), "2026-11-23"), { kind: "SCHEDULED_TODAY", day: "2026-11-23" });
  assert.equal(kind({ status: "IN_PROGRESS", scheduled: "2026-11-23" }), null);
  // Its day wins over Due's on the same morning (spec section 4).
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-23", due: "2026-11-23" }), "SCHEDULED_TODAY");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-23", due: "2026-11-22" }), "SCHEDULED_TODAY");
});

test("the 24-hour heads-up goes the day before, only at a home that needs notice", () => {
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-24", due: "2026-11-30", needsNotice: true }), "SCHEDULED_TOMORROW");
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-24", due: "2026-11-30" }), null);
  // Before a day is picked: the day before Due.
  assert.equal(kind({ due: "2026-11-24", needsNotice: true }), "DUE_TOMORROW");
  assert.equal(kind({ status: "WAITING", due: "2026-11-24", needsNotice: true }), "DUE_TOMORROW");
  assert.equal(kind({ status: "IN_PROGRESS", due: "2026-11-24", needsNotice: true }), null);
  // With a day picked, Due tomorrow says nothing; their day leads.
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-27", due: "2026-11-24", needsNotice: true }), null);
  // Scheduled tomorrow beats Due today.
  assert.equal(kind({ status: "SCHEDULED", scheduled: "2026-11-24", due: "2026-11-23", needsNotice: true }), "SCHEDULED_TOMORROW");
});

test("isSoon is today or tomorrow", () => {
  assert.ok(isSoon("2026-11-23", "2026-11-23"));
  assert.ok(isSoon("2026-11-24", "2026-11-23"));
  assert.ok(!isSoon("2026-11-25", "2026-11-23"));
  assert.ok(!isSoon("2026-11-22", "2026-11-23"));
});
