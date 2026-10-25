import test from "node:test";
import assert from "node:assert/strict";
import { fmtMonth, periodLabel, periodOf } from "./period";

test("fmtMonth: the year only when it isn't this year", () => {
  assert.equal(fmtMonth("2026-09", 2026), "Sep");
  assert.equal(fmtMonth("2025-11", 2026), "Nov 2025");
  assert.equal(fmtMonth("2026-01", 2026), "Jan");
  assert.equal(fmtMonth("2026-12", 2026), "Dec");
});

test("fmtMonth: a key it can't read comes back as is", () => {
  assert.equal(fmtMonth("2026-13", 2026), "2026-13");
  assert.equal(fmtMonth("Sep", 2026), "Sep");
});

test("periodLabel: within a year, across years, one month", () => {
  assert.equal(periodLabel("2026-01", "2026-09"), "Jan to Sep 2026");
  assert.equal(periodLabel("2025-11", "2026-02"), "Nov 2025 to Feb 2026");
  assert.equal(periodLabel("2026-09", "2026-09"), "Sep 2026");
});

test("periodLabel: reversed ends still read first to last", () => {
  assert.equal(periodLabel("2026-09", "2026-01"), "Jan to Sep 2026");
});

test("periodLabel: one end missing, or neither", () => {
  assert.equal(periodLabel("2026-03", null), "Mar 2026");
  assert.equal(periodLabel(null, "2026-04"), "Apr 2026");
  assert.equal(periodLabel(null, null), null);
  assert.equal(periodLabel("junk", "junk"), null);
});

test("periodOf: any order, and no months is null", () => {
  assert.equal(periodOf(["2026-04", "2025-12", "2026-01"]), "Dec 2025 to Apr 2026");
  assert.equal(periodOf([]), null);
});
