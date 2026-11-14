import test from "node:test";
import assert from "node:assert/strict";
import { easternHour, inReminderHour, reminderFor } from "./reminder-rules";

test("the reminders go out through the 8 o'clock hour in Buffalo, in daylight and standard time", () => {
  assert.equal(easternHour(new Date("2026-07-01T12:00:00Z")), 8); // EDT
  assert.equal(easternHour(new Date("2026-11-23T13:00:00Z")), 8); // EST
  assert.ok(inReminderHour(new Date("2026-11-23T13:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T12:59:00Z")));
  assert.ok(!inReminderHour(new Date("2026-11-23T14:00:00Z")));
});

test("due today on the date, due yesterday the morning after, nothing otherwise", () => {
  assert.equal(reminderFor("2026-11-23", "2026-11-23"), "DUE_TODAY");
  assert.equal(reminderFor("2026-11-22", "2026-11-23"), "OVERDUE");
  assert.equal(reminderFor("2026-11-21", "2026-11-23"), null);
  assert.equal(reminderFor("2026-11-24", "2026-11-23"), null);
  assert.equal(reminderFor(null, "2026-11-23"), null);
  // Across a month's end.
  assert.equal(reminderFor("2026-11-30", "2026-12-01"), "OVERDUE");
});
