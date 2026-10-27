import test from "node:test";
import assert from "node:assert/strict";
import {
  activityTime,
  clockTime,
  dayLabel,
  daysUntil,
  dueLabel,
  easternDayStart,
  fmtDay,
  fullStamp,
  historyDay,
  isPastDay,
  relativeDays,
  seenTime,
  todayYmd,
  todayYmdEastern,
  toYmd,
  ymdToDate,
} from "./dates";

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
  // A past date is the real date, however recent: "late" is the chip's color, not its words.
  assert.equal(dueLabel("2026-02-28", now), "Feb 28");
  assert.equal(dueLabel("2026-02-26", now), "Feb 26");
  assert.equal(dueLabel("2026-02-22", now), "Feb 22");
  assert.equal(dueLabel("2026-02-01", now), "Feb 1");
  assert.equal(dueLabel("2025-12-30", now), "Dec 30, 2025");
  assert.equal(dueLabel("2026-03-01", now), "today");
  assert.equal(dueLabel("2026-03-02", now), "tomorrow"); // 2026-03-02 is a Monday
  assert.equal(dueLabel("2026-03-03", now), "Tuesday");
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
  assert.equal(dueLabel("2026-10-19", "2026-10-22"), "Oct 19");
  assert.equal(dueLabel("2026-10-23", "2026-10-22"), "tomorrow");
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

/* ---------------- History (activity 2.4) ---------------- */

// Monday Oct 26, 2026 at 2:00 PM in Buffalo (EDT, UTC-4).
const NOW = new Date("2026-10-26T18:00:00Z");
const MONDAY = "2026-10-26";

test("clockTime: Buffalo's clock with a plain space, wherever it runs", () => {
  assert.equal(clockTime(new Date("2026-10-26T18:14:00Z")), "2:14 PM");
  assert.equal(clockTime("2026-10-26T13:05:00Z"), "9:05 AM");
  // Midnight and noon, and a winter date on the other offset (EST, UTC-5).
  assert.equal(clockTime(new Date("2026-10-26T04:00:00Z")), "12:00 AM");
  assert.equal(clockTime(new Date("2026-12-01T17:00:00Z")), "12:00 PM");
  assert.doesNotMatch(clockTime(NOW), /\u202f/);
  assert.equal(clockTime("garbage"), "");
});

test("activityTime: now, minutes and hours earlier today, then the clock time", () => {
  assert.equal(activityTime(new Date("2026-10-26T17:59:30Z"), NOW), "now");
  assert.equal(activityTime(new Date("2026-10-26T17:55:00Z"), NOW), "5m");
  assert.equal(activityTime(new Date("2026-10-26T17:00:30Z"), NOW), "59m");
  assert.equal(activityTime(new Date("2026-10-26T16:00:00Z"), NOW), "2h");
  // 9:30 AM this morning is still today: hours, not a clock time.
  assert.equal(activityTime(new Date("2026-10-26T13:30:00Z"), NOW), "4h");
  // Yesterday evening, under its own heading: the clock time, even inside 24 hours.
  assert.equal(activityTime(new Date("2026-10-26T01:14:00Z"), NOW), "9:14 PM");
  assert.equal(activityTime(new Date("2026-10-20T18:14:00Z"), NOW), "2:14 PM");
  // A clock running a little fast never reads as the future.
  assert.equal(activityTime(new Date("2026-10-26T18:00:20Z"), NOW), "now");
  // ISO strings, as they cross from a server component.
  assert.equal(activityTime("2026-10-26T16:00:00.000Z", NOW.toISOString()), "2h");
  assert.equal(activityTime("garbage", NOW), "");
});

test("activityTime: just after Buffalo midnight, a late entry is yesterday's clock time", () => {
  const justAfter = new Date("2026-10-26T04:10:00Z"); // 12:10 AM
  assert.equal(activityTime(new Date("2026-10-26T03:50:00Z"), justAfter), "11:50 PM");
  assert.equal(activityTime(new Date("2026-10-26T04:05:00Z"), justAfter), "5m");
});

test("activityTime: under a month heading, the day without its year", () => {
  assert.equal(activityTime(new Date("2026-08-03T18:14:00Z"), NOW, { month: true }), "Aug 3");
  assert.equal(activityTime(new Date("2025-08-03T18:14:00Z"), NOW, { month: true }), "Aug 3");
  // Read on Buffalo's calendar: 11 PM on Aug 3 is Aug 3, not the UTC Aug 4.
  assert.equal(activityTime(new Date("2026-08-04T03:00:00Z"), NOW, { month: true }), "Aug 3");
});

test("fullStamp: weekday, date and clock time, the year only when it isn't this year", () => {
  assert.equal(fullStamp(new Date("2026-10-29T18:14:00Z"), NOW), "Thu, Oct 29 at 2:14 PM");
  assert.equal(fullStamp(new Date("2025-10-30T18:14:00Z"), NOW), "Thu, Oct 30, 2025 at 2:14 PM");
  // A late evening is the Buffalo date, not the UTC one.
  assert.equal(fullStamp(new Date("2026-10-27T02:30:00Z"), NOW), "Mon, Oct 26 at 10:30 PM");
  assert.equal(fullStamp("", NOW), "");
});

test("historyDay: Today, Yesterday, a weekday within six days back, then the date", () => {
  assert.equal(historyDay("2026-10-26", MONDAY), "Today");
  assert.equal(historyDay("2026-10-25", MONDAY), "Yesterday");
  assert.equal(historyDay("2026-10-24", MONDAY), "Sat");
  assert.equal(historyDay("2026-10-20", MONDAY), "Tue");
  assert.equal(historyDay("2026-10-19", MONDAY), "Oct 19");
  assert.equal(historyDay("2025-12-30", MONDAY), "Dec 30, 2025");
  // Ahead of today it is the brand's row date, as dayLabel writes it.
  assert.equal(historyDay("2026-10-27", MONDAY), "Tomorrow");
  assert.equal(historyDay("not a day", MONDAY), "");
});

test("historyDay: a month heading names the month, with the year when it isn't this one", () => {
  assert.equal(historyDay("2026-09-14", MONDAY, { month: true }), "September");
  assert.equal(historyDay("2025-08-01", MONDAY, { month: true }), "August 2025");
  assert.equal(historyDay("2027-01-05", "2026-12-30", { month: true }), "January 2027");
});

test("seenTime: the clock time today, a weekday this past week, then the date", () => {
  assert.equal(seenTime(new Date("2026-10-26T18:14:00Z"), NOW), "2:14 PM");
  assert.equal(seenTime(new Date("2026-10-26T13:00:00Z"), NOW), "9:00 AM");
  // Yesterday is a weekday here, not "Yesterday" (G2B-I09).
  assert.equal(seenTime(new Date("2026-10-25T18:00:00Z"), NOW), "Sun");
  assert.equal(seenTime(new Date("2026-10-20T18:00:00Z"), NOW), "Tue");
  assert.equal(seenTime(new Date("2026-10-19T18:00:00Z"), NOW), "Oct 19");
  assert.equal(seenTime(new Date("2025-10-19T18:00:00Z"), NOW), "Oct 19, 2025");
});
