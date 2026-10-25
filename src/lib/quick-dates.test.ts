import test from "node:test";
import assert from "node:assert/strict";
import { addDaysYmd, mondayPick, quickPickForKey, quickPicks, weekdayOf } from "./quick-dates";

// 2026-10-22 is a Thursday.

test("addDaysYmd: crosses months, years and leap days; refuses junk", () => {
  assert.equal(addDaysYmd("2026-10-22", 1), "2026-10-23");
  assert.equal(addDaysYmd("2026-10-31", 1), "2026-11-01");
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysYmd("2026-02-30", 1), null);
  assert.equal(addDaysYmd("nope", 1), null);
});

test("addDaysYmd: the clock change weekend is still one day per day", () => {
  // US DST ends 2026-11-01. UTC arithmetic never sees it.
  assert.equal(addDaysYmd("2026-10-31", 2), "2026-11-02");
  assert.equal(addDaysYmd("2026-03-07", 2), "2026-03-09");
});

test("weekdayOf: 0 is Sunday", () => {
  assert.equal(weekdayOf("2026-10-22"), 4);
  assert.equal(weekdayOf("2026-10-25"), 0);
  assert.equal(weekdayOf("2026-10-26"), 1);
});

test("mondayPick: the next Monday; a week out on a Monday; skips tomorrow on a Sunday", () => {
  assert.equal(mondayPick("2026-10-22"), "2026-10-26"); // Thu
  assert.equal(mondayPick("2026-10-24"), "2026-10-26"); // Sat
  assert.equal(mondayPick("2026-10-26"), "2026-11-02"); // Mon: never today
  assert.equal(mondayPick("2026-10-27"), "2026-11-02"); // Tue
  assert.equal(mondayPick("2026-10-25"), "2026-11-02"); // Sun: tomorrow is already "Tomorrow"
});

test("quickPicks: five picks in order with their resolved hints", () => {
  const picks = quickPicks("2026-10-22");
  assert.deepEqual(
    picks.map((p) => [p.key, p.label, p.value, p.hint]),
    [
      ["today", "Today", "2026-10-22", "Thu"],
      ["tomorrow", "Tomorrow", "2026-10-23", "Fri"],
      ["monday", "Monday", "2026-10-26", "Oct 26"],
      ["next-week", "Next week", "2026-10-29", "Thu, Oct 29"],
      ["none", "No date", null, ""],
    ],
  );
});

test("quickPicks: Monday and Tomorrow never collide", () => {
  for (let i = 0; i < 14; i++) {
    const today = addDaysYmd("2026-10-18", i)!;
    const picks = quickPicks(today);
    const tomorrow = picks.find((p) => p.key === "tomorrow")!;
    const monday = picks.find((p) => p.key === "monday")!;
    assert.notEqual(monday.value, tomorrow.value, today);
    assert.notEqual(monday.value, today, today);
    assert.equal(weekdayOf(monday.value!), 1, today);
  }
});

test("quickPicks: on a Sunday the picks stay in date order, and Monday reads Next Monday", () => {
  const picks = quickPicks("2026-10-25");
  assert.deepEqual(
    picks.map((p) => [p.key, p.label, p.value]),
    [
      ["today", "Today", "2026-10-25"],
      ["tomorrow", "Tomorrow", "2026-10-26"],
      ["next-week", "Next week", "2026-11-01"],
      ["monday", "Next Monday", "2026-11-02"],
      ["none", "No date", null],
    ],
  );
});

test("quickPicks: an invalid today throws instead of offering wrong dates", () => {
  assert.throws(() => quickPicks("2026-02-30"));
});

test("quickPickForKey: 1 to 5 choose; anything else is null", () => {
  const picks = quickPicks("2026-10-22");
  assert.equal(quickPickForKey(picks, "1")?.key, "today");
  assert.equal(quickPickForKey(picks, "5")?.key, "none");
  assert.equal(quickPickForKey(picks, "6"), null);
  assert.equal(quickPickForKey(picks, "0"), null);
  assert.equal(quickPickForKey(picks, "a"), null);
  assert.equal(quickPickForKey(picks, "Enter"), null);
});
