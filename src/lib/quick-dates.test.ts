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

test("quickPicks: five picks in order with their resolved hints and fixed numbers", () => {
  const picks = quickPicks("2026-10-22");
  assert.deepEqual(
    picks.map((p) => [p.key, p.number, p.label, p.value, p.hint]),
    [
      ["today", 1, "Today", "2026-10-22", "Thu"],
      ["tomorrow", 2, "Tomorrow", "2026-10-23", "Fri"],
      ["monday", 3, "Monday", "2026-10-26", "Oct 26"],
      ["next-week", 4, "Next week", "2026-10-29", "Thu, Oct 29"],
      ["none", 5, "No date", null, ""],
    ],
  );
});

test("quickPicks: Monday hides on a Monday, since it lands on the same day as Next week", () => {
  const picks = quickPicks("2026-10-26"); // a Monday
  assert.deepEqual(picks.map((p) => p.key), ["today", "tomorrow", "next-week", "none"]);
  assert.equal(picks.find((p) => p.key === "next-week")!.value, "2026-11-02");
  // The numbers stay with their picks: 3 is skipped, 4 is still Next week.
  assert.deepEqual(picks.map((p) => p.number), [1, 2, 4, 5]);
});

test("quickPicks: Monday shows every other day of the week, and never duplicates another pick's date", () => {
  for (let i = 0; i < 14; i++) {
    const today = addDaysYmd("2026-10-18", i)!;
    const picks = quickPicks(today);
    const dates = picks.map((p) => p.value).filter((v): v is string => v !== null);
    assert.equal(new Set(dates).size, dates.length, `${today}: two picks land on one day`);
    const monday = picks.find((p) => p.key === "monday");
    if (weekdayOf(today) === 1) assert.equal(monday, undefined, today);
    else {
      assert.equal(weekdayOf(monday!.value!), 1, today);
      assert.notEqual(monday!.value, today, today);
    }
  }
});

test("quickPicks: the numbers are the same on every day of the week", () => {
  for (let i = 0; i < 14; i++) {
    const today = addDaysYmd("2026-10-18", i)!;
    const byKey = Object.fromEntries(quickPicks(today).map((p) => [p.key, p.number]));
    assert.equal(byKey.today, 1, today);
    assert.equal(byKey.tomorrow, 2, today);
    if (byKey.monday !== undefined) assert.equal(byKey.monday, 3, today);
    assert.equal(byKey["next-week"], 4, today);
    assert.equal(byKey.none, 5, today);
  }
});

test("quickPicks: on a Sunday Monday reads Next Monday, and the picks stay in number order", () => {
  const picks = quickPicks("2026-10-25");
  assert.deepEqual(
    picks.map((p) => [p.key, p.number, p.label, p.value]),
    [
      ["today", 1, "Today", "2026-10-25"],
      ["tomorrow", 2, "Tomorrow", "2026-10-26"],
      ["monday", 3, "Next Monday", "2026-11-02"],
      ["next-week", 4, "Next week", "2026-11-01"],
      ["none", 5, "No date", null],
    ],
  );
});

test("quickPicks: an invalid today throws instead of offering wrong dates", () => {
  assert.throws(() => quickPicks("2026-02-30"));
});

test("quickPickForKey: a number chooses its pick; a number with no pick today, or any other key, is null", () => {
  const picks = quickPicks("2026-10-22");
  assert.equal(quickPickForKey(picks, "1")?.key, "today");
  assert.equal(quickPickForKey(picks, "3")?.key, "monday");
  assert.equal(quickPickForKey(picks, "5")?.key, "none");
  assert.equal(quickPickForKey(picks, "6"), null);
  assert.equal(quickPickForKey(picks, "0"), null);
  assert.equal(quickPickForKey(picks, "a"), null);
  assert.equal(quickPickForKey(picks, "Enter"), null);
});

test("quickPickForKey: on a Monday 3 is nothing and 4 is still Next week", () => {
  const picks = quickPicks("2026-10-26");
  assert.equal(quickPickForKey(picks, "3"), null, "the Monday pick is hidden; 4 is not handed down");
  assert.equal(quickPickForKey(picks, "4")?.key, "next-week");
  assert.equal(quickPickForKey(picks, "5")?.key, "none");
});
