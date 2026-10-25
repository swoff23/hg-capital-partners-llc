import test from "node:test";
import assert from "node:assert/strict";
import { easternDay, noteDay } from "./format";

// Whatever TZ the test process runs in, the days below are Buffalo's.
const today = "2026-10-25";

test("easternDay: an instant is read on Buffalo's calendar", () => {
  // 10:30pm on Oct 25 in Buffalo is already Oct 26 in UTC.
  assert.equal(easternDay(new Date("2026-10-26T02:30:00Z"), today), "Oct 25");
  assert.equal(easternDay(new Date("2026-10-25T14:00:00Z"), today), "Oct 25");
});

test("easternDay: the year shows only when it isn't this year", () => {
  assert.equal(easternDay(new Date("2025-03-01T15:00:00Z"), today), "Mar 1, 2025");
  assert.equal(easternDay(new Date("2026-03-01T15:00:00Z"), today), "Mar 1");
});

test("noteDay: an imported line keeps its calendar date", () => {
  // Stored at UTC midnight, which is the evening before in Buffalo.
  const noteDate = new Date("2026-10-20T00:00:00Z");
  assert.equal(noteDay({ noteDate, source: "migration" }, today), "Oct 20");
  assert.equal(noteDay({ noteDate, source: "manual" }, today), "Oct 19");
  assert.equal(noteDay({ noteDate, source: "change" }, today), "Oct 19");
});
