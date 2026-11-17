import test from "node:test";
import assert from "node:assert/strict";
import { addDaysYmd, fridayPick, mondayPick, quickPickForKey, quickPicks, weekdayOf } from "./quick-dates";

// 2026-10-18 is a Sunday; 2026-10-22 a Thursday; 2026-11-17 a Tuesday.

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

test("fridayPick: the first Friday after today; the coming week's on a weekend", () => {
  assert.equal(fridayPick("2026-10-19"), "2026-10-23"); // Mon
  assert.equal(fridayPick("2026-10-21"), "2026-10-23"); // Wed
  assert.equal(fridayPick("2026-10-22"), "2026-10-23"); // Thu: tomorrow (the pick hides)
  assert.equal(fridayPick("2026-10-23"), "2026-10-30"); // Fri: never today (the pick hides)
  assert.equal(fridayPick("2026-10-24"), "2026-10-30"); // Sat
  assert.equal(fridayPick("2026-10-25"), "2026-10-30"); // Sun
});

test("mondayPick: the next Monday; a week out on a Monday; skips tomorrow on a Sunday", () => {
  assert.equal(mondayPick("2026-10-22"), "2026-10-26"); // Thu
  assert.equal(mondayPick("2026-10-24"), "2026-10-26"); // Sat
  assert.equal(mondayPick("2026-10-26"), "2026-11-02"); // Mon: never today
  assert.equal(mondayPick("2026-10-27"), "2026-11-02"); // Tue
  assert.equal(mondayPick("2026-10-25"), "2026-11-02"); // Sun: tomorrow is already "Tomorrow"
});

test("quickPicks: seven picks in order with their resolved hints and fixed numbers", () => {
  const picks = quickPicks("2026-11-17"); // a Tuesday
  assert.deepEqual(
    picks.map((p) => [p.key, p.number, p.label, p.value, p.hint]),
    [
      ["today", 1, "Today", "2026-11-17", "Tue"],
      ["tomorrow", 2, "Tomorrow", "2026-11-18", "Wed"],
      ["friday", 3, "Friday", "2026-11-20", "Nov 20"],
      ["next-monday", 4, "Next Monday", "2026-11-23", "Nov 23"],
      ["week", 5, "In 1 week", "2026-11-24", "Tue, Nov 24"],
      ["two-weeks", 6, "In 2 weeks", "2026-12-01", "Tue, Dec 1"],
      ["none", 7, "No date", null, ""],
    ],
  );
});

test("quickPicks: Friday hides on a Thursday (it's Tomorrow) and on a Friday (it's In 1 week)", () => {
  const thu = quickPicks("2026-10-22");
  assert.deepEqual(thu.map((p) => p.key), ["today", "tomorrow", "next-monday", "week", "two-weeks", "none"]);
  // The numbers stay with their picks: 3 is skipped, 4 is still Next Monday.
  assert.deepEqual(thu.map((p) => p.number), [1, 2, 4, 5, 6, 7]);
  const fri = quickPicks("2026-10-23");
  assert.deepEqual(fri.map((p) => p.key), ["today", "tomorrow", "next-monday", "week", "two-weeks", "none"]);
  assert.equal(fri.find((p) => p.key === "week")!.value, "2026-10-30");
});

test("quickPicks: Next Monday hides on a Monday, since it lands on the same day as In 1 week", () => {
  const picks = quickPicks("2026-10-26"); // a Monday
  assert.deepEqual(picks.map((p) => p.key), ["today", "tomorrow", "friday", "week", "two-weeks", "none"]);
  assert.equal(picks.find((p) => p.key === "week")!.value, "2026-11-02");
  assert.deepEqual(picks.map((p) => p.number), [1, 2, 3, 5, 6, 7]);
});

test("quickPicks: on a weekend Friday is the coming week's, and Sunday's Next Monday is 8 days out", () => {
  assert.deepEqual(
    quickPicks("2026-10-24").map((p) => [p.key, p.value]), // Sat
    [
      ["today", "2026-10-24"],
      ["tomorrow", "2026-10-25"],
      ["friday", "2026-10-30"],
      ["next-monday", "2026-10-26"],
      ["week", "2026-10-31"],
      ["two-weeks", "2026-11-07"],
      ["none", null],
    ],
  );
  assert.deepEqual(
    quickPicks("2026-10-25").map((p) => [p.key, p.value]), // Sun
    [
      ["today", "2026-10-25"],
      ["tomorrow", "2026-10-26"],
      ["friday", "2026-10-30"],
      ["next-monday", "2026-11-02"],
      ["week", "2026-11-01"],
      ["two-weeks", "2026-11-08"],
      ["none", null],
    ],
  );
});

test("quickPicks: every day of the week, each pick lands on its weekday and no two picks share a day", () => {
  for (let i = 0; i < 14; i++) {
    const today = addDaysYmd("2026-10-18", i)!;
    const dow = weekdayOf(today);
    const picks = quickPicks(today);
    const dates = picks.map((p) => p.value).filter((v): v is string => v !== null);
    assert.equal(new Set(dates).size, dates.length, `${today}: two picks land on one day`);
    assert.ok(dates.every((d) => d >= today), `${today}: a pick lands in the past`);
    const friday = picks.find((p) => p.key === "friday");
    if (dow === 4 || dow === 5) assert.equal(friday, undefined, today);
    else assert.equal(weekdayOf(friday!.value!), 5, today);
    const monday = picks.find((p) => p.key === "next-monday");
    if (dow === 1) assert.equal(monday, undefined, today);
    else {
      assert.equal(weekdayOf(monday!.value!), 1, today);
      assert.notEqual(monday!.value, addDaysYmd(today, 1), today);
    }
  }
});

test("quickPicks: the numbers are the same on every day of the week", () => {
  for (let i = 0; i < 14; i++) {
    const today = addDaysYmd("2026-10-18", i)!;
    const byKey = Object.fromEntries(quickPicks(today).map((p) => [p.key, p.number]));
    assert.equal(byKey.today, 1, today);
    assert.equal(byKey.tomorrow, 2, today);
    if (byKey.friday !== undefined) assert.equal(byKey.friday, 3, today);
    if (byKey["next-monday"] !== undefined) assert.equal(byKey["next-monday"], 4, today);
    assert.equal(byKey.week, 5, today);
    assert.equal(byKey["two-weeks"], 6, today);
    assert.equal(byKey.none, 7, today);
  }
});

test("quickPicks: an invalid today throws instead of offering wrong dates", () => {
  assert.throws(() => quickPicks("2026-02-30"));
});

test("quickPickForKey: a number chooses its pick; a number with no pick today, or any other key, is null", () => {
  const picks = quickPicks("2026-11-17");
  assert.equal(quickPickForKey(picks, "1")?.key, "today");
  assert.equal(quickPickForKey(picks, "3")?.key, "friday");
  assert.equal(quickPickForKey(picks, "6")?.key, "two-weeks");
  assert.equal(quickPickForKey(picks, "7")?.key, "none");
  assert.equal(quickPickForKey(picks, "8"), null);
  assert.equal(quickPickForKey(picks, "0"), null);
  assert.equal(quickPickForKey(picks, "a"), null);
  assert.equal(quickPickForKey(picks, "Enter"), null);
});

test("quickPickForKey: a hidden pick's number is nothing, never handed to the next pick", () => {
  const thu = quickPicks("2026-10-22");
  assert.equal(quickPickForKey(thu, "3"), null, "Friday is hidden on a Thursday");
  assert.equal(quickPickForKey(thu, "4")?.key, "next-monday");
  const mon = quickPicks("2026-10-26");
  assert.equal(quickPickForKey(mon, "4"), null, "Next Monday is hidden on a Monday");
  assert.equal(quickPickForKey(mon, "5")?.key, "week");
  assert.equal(quickPickForKey(mon, "7")?.key, "none");
});
