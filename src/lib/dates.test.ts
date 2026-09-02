import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, dueLabel, fmtDay, isPastDay, relativeDays, todayYmd, toYmd, ymdToDate } from "./dates";

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
  assert.equal(dueLabel("2026-02-01", now), "yesterday"); // any overdue
  assert.equal(dueLabel("2026-03-01", now), "today");
  assert.equal(dueLabel("2026-03-02", now), "Monday"); // 2026-03-02 is a Monday
  assert.equal(dueLabel("2026-03-07", now), "Saturday");
  assert.equal(dueLabel("2026-03-08", now), "Mar 8");
  assert.equal(dueLabel("2027-01-05", now), "Jan 5, 2027");
  assert.equal(dueLabel(null, now), "");
});
