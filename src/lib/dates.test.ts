import test from "node:test";
import assert from "node:assert/strict";
import { dayLabel, daysUntil, dueLabel, easternDayStart, fmtDay, isPastDay, relativeDays, todayYmd, todayYmdEastern, toYmd, ymdToDate } from "./dates";

// A fixed "now": 2026-03-01 at 03:30 local. The assertions below must hold
// whatever TZ the test process runs in — that is the point of the module.
const now = new Date(2026, 2, 1, 3, 30);

test("toYmd: Date is read by UTC fields; strings are validated", () => {
  assert.equal(toYmd(new Date(Date.UTC(2026, 2, 1))), "2026-03-01");
  assert.equal(toYmd("2026-03-01"), "2026-03-01");
  assert.equal(toYmd("2026-03-01T00:00:00.000Z"), "2026-03-01");
  assert.equal(toYmd(" 2026-03-01 "), "2026-03-01");
  assert.equal(toYmd("2026-02-30"), null);
  assert.equal(toYmd("2026-13-01"), null);
  assert.equal(toYmd("3/1/2026"), null);
  assert.equal(toYmd(""), null);
  assert.equal(toYmd(null), null);
  assert.equal(toYmd(undefined), null);
  assert.equal(toYmd(new Date("garbage")), null);
});

test("ymdToDate: UTC midnight, round-trips through toYmd", () => {
  const d = ymdToDate("2026-03-01")!;
  assert.equal(d.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(toYmd(d), "2026-03-01");
  assert.equal(ymdToDate(""), null);
  assert.equal(ymdToDate("nope"), null);
  assert.equal(ymdToDate(null), null);
});

test("todayYmd uses the local calendar date", () => {
  assert.equal(todayYmd(now), "2026-03-01");
  assert.equal(todayYmd(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("fmtDay never shifts by timezone", () => {
  assert.equal(fmtDay("2026-03-01"), "Mar 1, 2026");
  assert.equal(fmtDay(new Date(Date.UTC(2026, 2, 1))), "Mar 1, 2026");
  assert.equal(fmtDay("2026-03-01T00:00:00.000Z"), "Mar 1, 2026");
  assert.equal(fmtDay("2026-03-01", { year: "auto", now }), "Mar 1");
  assert.equal(fmtDay("2027-03-01", { year: "auto", now }), "Mar 1, 2027");
  assert.equal(fmtDay(null), "—");
  assert.equal(fmtDay("bad"), "—");
});

test("daysUntil / isPastDay compare calendar dates", () => {
  assert.equal(daysUntil("2026-03-01", now), 0);
  assert.equal(daysUntil("2026-03-02", now), 1);
  assert.equal(daysUntil("2026-02-28", now), -1);
  assert.equal(daysUntil(new Date(Date.UTC(2026, 2, 31)), now), 30);
  assert.equal(daysUntil(null, now), null);
  assert.equal(isPastDay("2026-02-28", now), true);
  assert.equal(isPastDay("2026-03-01", now), false); // today is not past
  assert.equal(isPastDay(null, now), false);
});

test("relativeDays", () => {
  assert.equal(relativeDays("2026-03-01", now), "today");
  assert.equal(relativeDays("2026-03-02", now), "tomorrow");
  assert.equal(relativeDays("2026-02-28", now), "yesterday");
  assert.equal(relativeDays("2026-02-20", now), "9d ago");
  assert.equal(relativeDays("2026-03-11", now), "in 10d");
  assert.equal(relativeDays(null, now), "");
});

test("dueLabel", () => {
  assert.equal(dueLabel("2026-02-28", now), "yesterday");
  assert.equal(dueLabel("2026-02-26", now), "3d late");
  assert.equal(dueLabel("2026-02-23", now), "6d late");
  assert.equal(dueLabel("2026-02-22", now), "Feb 22"); // a week or more late: the date
  assert.equal(dueLabel("2026-02-01", now), "Feb 1");
  assert.equal(dueLabel("2025-12-30", now), "Dec 30, 2025");
  assert.equal(dueLabel("2026-03-01", now), "today");
  assert.equal(dueLabel("2026-03-02", now), "Monday"); // 2026-03-02 is a Monday
  assert.equal(dueLabel("2026-03-07", now), "Saturday");
  assert.equal(dueLabel("2026-03-08", now), "Mar 8");
  assert.equal(dueLabel("2027-01-05", now), "Jan 5, 2027");
  assert.equal(dueLabel(null, now), "");
});

test("todayYmdEastern: Buffalo's date, not UTC's", () => {
  // 11:30pm EDT on Oct 22 is already Oct 23 in UTC.
  assert.equal(todayYmdEastern(new Date("2026-10-23T03:30:00Z")), "2026-10-22");
  assert.equal(todayYmdEastern(new Date("2026-10-23T04:00:00Z")), "2026-10-23");
  // After DST ends (Nov 1, 2026) Eastern is UTC-5.
  assert.equal(todayYmdEastern(new Date("2026-11-02T04:30:00Z")), "2026-11-01");
  assert.equal(todayYmdEastern(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
});

test("helpers accept an explicit today (Ymd) instead of an instant", () => {
  assert.equal(daysUntil("2026-10-25", "2026-10-22"), 3);
  assert.equal(isPastDay("2026-10-21", "2026-10-22"), true);
  assert.equal(relativeDays("2026-10-21", "2026-10-22"), "yesterday");
  assert.equal(dueLabel("2026-10-19", "2026-10-22"), "3d late");
  assert.equal(fmtDay("2026-12-05", { year: "auto", now: "2026-10-22" }), "Dec 5");
  assert.equal(fmtDay("2027-01-05", { year: "auto", now: "2026-10-22" }), "Jan 5, 2027");
});

test("fmtDay can lead with the weekday, still without shifting", () => {
  assert.equal(fmtDay("2026-10-29", { weekday: true, year: "auto", now: "2026-10-22" }), "Thu, Oct 29");
  assert.equal(fmtDay(new Date(Date.UTC(2026, 9, 29)), { weekday: true, year: "auto", now: "2026-10-22" }), "Thu, Oct 29");
  assert.equal(fmtDay("2027-01-05", { weekday: true, year: "auto", now: "2026-12-30" }), "Tue, Jan 5, 2027");
  assert.equal(fmtDay(null, { weekday: true }), "—");
});

test("easternDayStart: Buffalo midnight in UTC, across daylight time", () => {
  assert.equal(easternDayStart("2026-10-22").toISOString(), "2026-10-22T04:00:00.000Z");
  assert.equal(easternDayStart("2026-12-01").toISOString(), "2026-12-01T05:00:00.000Z");
  // The days the clocks change: midnight is still on the old offset.
  assert.equal(easternDayStart("2026-03-08").toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(easternDayStart("2026-11-01").toISOString(), "2026-11-01T04:00:00.000Z");
});

const SUNDAY = "2026-10-25";

test("dayLabel: Today, Tomorrow, a weekday within six days, then the date", () => {
  assert.equal(dayLabel("2026-10-25", SUNDAY), "Today");
  assert.equal(dayLabel("2026-10-26", SUNDAY), "Tomorrow");
  assert.equal(dayLabel("2026-10-27", SUNDAY), "Tue");
  assert.equal(dayLabel("2026-10-31", SUNDAY), "Sat");
  assert.equal(dayLabel("2026-11-01", SUNDAY), "Nov 1");
  assert.equal(dayLabel("2027-01-05", SUNDAY), "Jan 5, 2027");
});

test("dayLabel: a past date is the real date, never a weekday", () => {
  assert.equal(dayLabel("2026-10-24", SUNDAY), "Oct 24");
  assert.equal(dayLabel("2026-10-19", SUNDAY), "Oct 19");
  assert.equal(dayLabel("2025-12-30", SUNDAY), "Dec 30, 2025");
});
