import test from "node:test";
import assert from "node:assert/strict";
import { currentMonth, monthBounds, monthRange, planMonths } from "./months";

test("currentMonth uses UTC", () => {
  assert.equal(currentMonth(new Date(Date.UTC(2026, 8, 1, 0, 30))), "2026-09");
  assert.equal(currentMonth(new Date(Date.UTC(2026, 11, 31, 23, 59))), "2026-12");
});

test("monthRange is inclusive and wraps the year", () => {
  assert.deepEqual(monthRange("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthRange("2026-03", "2026-03"), ["2026-03"]);
  assert.deepEqual(monthRange("2026-04", "2026-03"), []);
});

test("monthBounds handles February and December", () => {
  assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
});

test("planMonths: full = everything", () => {
  const p = planMonths("2026-01", "2026-09", "full", "2026-03");
  assert.deepEqual(p.months, monthRange("2026-01", "2026-09"));
  assert.equal(p.nextSweepCursor, null);
});

test("planMonths: short history = recent only", () => {
  const p = planMonths("2026-07", "2026-09", "incremental", null);
  assert.deepEqual(p.months, ["2026-07", "2026-08", "2026-09"]);
  assert.equal(p.nextSweepCursor, null);
});

test("planMonths: incremental = recent + rotating sweep, sorted, deduped", () => {
  // 20 months of history: 2025-02 .. 2026-09. Older = 2025-02..2026-06 (17 months).
  const p1 = planMonths("2025-02", "2026-09", "incremental", null);
  assert.deepEqual(p1.months, ["2025-02", "2025-03", "2025-04", "2025-05", "2026-07", "2026-08", "2026-09"]);
  assert.equal(p1.nextSweepCursor, "2025-06");

  const p2 = planMonths("2025-02", "2026-09", "incremental", p1.nextSweepCursor);
  assert.deepEqual(p2.months, ["2025-06", "2025-07", "2025-08", "2025-09", "2026-07", "2026-08", "2026-09"]);

  // near the end the sweep wraps around to the start of history
  const p3 = planMonths("2025-02", "2026-09", "incremental", "2026-05");
  assert.deepEqual(p3.months, ["2025-02", "2025-03", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(p3.nextSweepCursor, "2025-04");

  // an unknown cursor (history start changed) restarts from the beginning
  assert.equal(planMonths("2025-02", "2026-09", "incremental", "1999-01").months[0], "2025-02");
});

test("planMonths: every older month is visited within ceil(older/SWEEP) runs", () => {
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const p = planMonths("2025-02", "2026-09", "incremental", cursor);
    p.months.forEach((m) => seen.add(m));
    cursor = p.nextSweepCursor;
  }
  assert.deepEqual([...seen].sort(), monthRange("2025-02", "2026-09"));
});
