import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonLabel,
  fmtMonth,
  fmtMonthYear,
  inPriorWindow,
  inSpan,
  monthEnd,
  monthInitial,
  monthShort,
  monthToDateLabel,
  periodFromParam,
  periodLabel,
  periodOf,
  periodSpan,
  priorSpan,
  priorWindow,
  sameDayYearBefore,
  spanInsideHistory,
  throughDay,
} from "./period";

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

test("fmtMonthYear, monthShort and monthInitial", () => {
  assert.equal(fmtMonthYear("2026-09"), "Sep 2026");
  assert.equal(monthShort("2025-11"), "Nov");
  assert.equal(monthInitial("2026-06"), "J");
  assert.equal(monthInitial("2026-08"), "A");
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

test("periodLabel: a through day ends the span on the last synced day", () => {
  assert.equal(periodLabel("2026-01", "2026-10", { through: "2026-10-25" }), "Jan 1 to Oct 25, 2026");
  assert.equal(periodLabel("2026-10", "2026-10", { through: "2026-10-25" }), "Oct 1 to 25, 2026");
  assert.equal(periodLabel("2026-10", "2026-10", { through: "2026-10-01" }), "Oct 1, 2026");
  assert.equal(periodLabel("2025-11", "2026-10", { through: "2026-10-25" }), "Nov 1, 2025 to Oct 25, 2026");
  // A sync that stopped before the running month still bounds the span honestly.
  assert.equal(periodLabel("2026-01", "2026-10", { through: "2026-09-02" }), "Jan 1 to Sep 2, 2026");
  // A day outside the span is left out.
  assert.equal(periodLabel("2026-01", "2026-01", { through: "2025-12-30" }), "Jan 2026");
  assert.equal(periodLabel("2026-01", "2026-09", { through: null }), "Jan to Sep 2026");
});

test("periodOf: any order, and no months is null", () => {
  assert.equal(periodOf(["2026-04", "2025-12", "2026-01"]), "Dec 2025 to Apr 2026");
  assert.equal(periodOf([]), null);
  assert.equal(periodOf(["2026-10", "2026-01"], { through: "2026-10-25" }), "Jan 1 to Oct 25, 2026");
});

test("monthToDateLabel: the running month through the last synced day", () => {
  assert.equal(monthToDateLabel("2026-10", "2026-10-25"), "Oct 1 to 25");
  assert.equal(monthToDateLabel("2026-10", "2026-10-01"), "Oct 1");
  assert.equal(monthToDateLabel("2026-10", "2026-09-02"), "Oct so far");
  assert.equal(monthToDateLabel("2026-10", null), "Oct so far");
});

test("periodFromParam: Year to date unless it says last", () => {
  assert.equal(periodFromParam("last"), "last");
  assert.equal(periodFromParam(["last", "ytd"]), "last");
  assert.equal(periodFromParam("ytd"), "ytd");
  assert.equal(periodFromParam(undefined), "ytd");
  assert.equal(periodFromParam("12m"), "ytd");
});

test("periodSpan: Last month is the one before the running month; Year to date starts in January", () => {
  assert.deepEqual(periodSpan("last", "2026-10"), { from: "2026-09", to: "2026-09" });
  assert.deepEqual(periodSpan("last", "2027-01"), { from: "2026-12", to: "2026-12" });
  assert.deepEqual(periodSpan("ytd", "2026-10"), { from: "2026-01", to: "2026-10" });
  assert.deepEqual(periodSpan("ytd", "2027-01"), { from: "2027-01", to: "2027-01" });
});

test("priorSpan: the month before, or the same months a year earlier", () => {
  assert.deepEqual(priorSpan("last", { from: "2026-09", to: "2026-09" }), { from: "2026-08", to: "2026-08" });
  assert.deepEqual(priorSpan("last", { from: "2026-01", to: "2026-01" }), { from: "2025-12", to: "2025-12" });
  assert.deepEqual(priorSpan("ytd", { from: "2026-01", to: "2026-10" }), { from: "2025-01", to: "2025-10" });
});

test("spanInsideHistory: a comparison shows only when its prior span is synced", () => {
  // In 2026, with history from January: Last month compares, Year to date doesn't.
  assert.equal(spanInsideHistory(priorSpan("last", periodSpan("last", "2026-10")), "2026-01"), true);
  assert.equal(spanInsideHistory(priorSpan("ytd", periodSpan("ytd", "2026-10")), "2026-01"), false);
  // February's Last month is January, compared with December: before history.
  assert.equal(spanInsideHistory(priorSpan("last", periodSpan("last", "2026-02")), "2026-01"), false);
  // From January 2027 Year to date compares with January 2026.
  assert.equal(spanInsideHistory(priorSpan("ytd", periodSpan("ytd", "2027-01")), "2026-01"), true);
});

test("inSpan includes both ends", () => {
  const s = { from: "2026-01", to: "2026-10" };
  assert.equal(inSpan("2026-01", s), true);
  assert.equal(inSpan("2026-10", s), true);
  assert.equal(inSpan("2025-12", s), false);
  assert.equal(inSpan("2026-11", s), false);
});

test("throughDay: only for a span ending in the running month, never past today", () => {
  const ytd = { from: "2026-01", to: "2026-10" };
  assert.equal(throughDay(ytd, "2026-10", "2026-10-25", "2026-10-26"), "2026-10-25");
  assert.equal(throughDay(ytd, "2026-10", "2026-09-02", "2026-10-26"), "2026-09-02");
  assert.equal(throughDay(ytd, "2026-10", "2026-10-27", "2026-10-26"), "2026-10-26");
  assert.equal(throughDay(ytd, "2026-10", null, "2026-10-26"), null);
  assert.equal(throughDay({ from: "2026-09", to: "2026-09" }, "2026-10", "2026-10-25", "2026-10-26"), null);
});

test("throughDay: a past span is partial when the sync stopped inside it", () => {
  const sep = { from: "2026-09", to: "2026-09" };
  // The local sandbox: Last month is September, the last sync was September 2.
  assert.equal(throughDay(sep, "2026-10", "2026-09-02", "2026-10-26"), "2026-09-02");
  // Synced on the month's last day or later: the month is whole.
  assert.equal(throughDay(sep, "2026-10", "2026-09-30", "2026-10-26"), null);
  assert.equal(throughDay(sep, "2026-10", "2026-10-05", "2026-10-26"), null);
  // Nothing synced: nothing to say.
  assert.equal(throughDay(sep, "2026-10", null, "2026-10-26"), null);
});

test("monthEnd and sameDayYearBefore", () => {
  assert.equal(monthEnd("2026-09"), "2026-09-30");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(monthEnd("2026-13"), null);
  assert.equal(sameDayYearBefore("2027-01-10"), "2026-01-10");
  assert.equal(sameDayYearBefore("2028-02-29"), "2027-02-28");
  assert.equal(sameDayYearBefore("nope"), null);
});

test("priorWindow: like for like, or none", () => {
  const jan27 = periodSpan("ytd", "2027-01");
  // Year to date ten days into the year: the prior span stops on the same day.
  assert.deepEqual(priorWindow("ytd", jan27, "2027-01-10"), { span: { from: "2026-01", to: "2026-01" }, through: "2026-01-10" });
  // A stale sync inside the year bounds the whole prior span.
  assert.deepEqual(priorWindow("ytd", periodSpan("ytd", "2027-10"), "2027-09-02"), {
    span: { from: "2026-01", to: "2026-10" },
    through: "2026-09-02",
  });
  // A whole Last month compares with the whole month before it.
  assert.deepEqual(priorWindow("last", { from: "2026-09", to: "2026-09" }, null), {
    span: { from: "2026-08", to: "2026-08" },
    through: null,
  });
  // A sync that stopped before the year began left the span empty.
  assert.equal(priorWindow("ytd", jan27, "2026-09-02"), null);
  // Last month the sync hasn't finished has no fair match.
  assert.equal(priorWindow("last", { from: "2026-09", to: "2026-09" }, "2026-09-02"), null);
});

test("inPriorWindow: a bounded span takes only the days up to the bound", () => {
  const w = { span: { from: "2026-01", to: "2026-01" }, through: "2026-01-10" };
  assert.equal(inPriorWindow({ periodMonth: "2026-01", txnDay: "2026-01-10" }, w), true);
  assert.equal(inPriorWindow({ periodMonth: "2026-01", txnDay: "2026-01-11" }, w), false);
  assert.equal(inPriorWindow({ periodMonth: "2026-02", txnDay: "2026-02-01" }, w), false);
  // A whole span takes every day.
  assert.equal(inPriorWindow({ periodMonth: "2026-01", txnDay: "2026-01-31" }, { span: w.span, through: null }), true);
});

test("comparisonLabel: a partial Year to date keeps its last day", () => {
  assert.equal(
    comparisonLabel("ytd", { from: "2027-01", to: "2027-01" }, { from: "2026-01", to: "2026-01" }, "2027-01-10"),
    "Jan 1 to 10, 2027 vs 2026",
  );
  assert.equal(
    comparisonLabel("ytd", { from: "2027-01", to: "2027-10" }, { from: "2026-01", to: "2026-10" }, "2027-10-25"),
    "Jan 1 to Oct 25, 2027 vs 2026",
  );
});

test("comparisonLabel: the basis said once", () => {
  assert.equal(comparisonLabel("last", { from: "2026-09", to: "2026-09" }, { from: "2026-08", to: "2026-08" }), "Sep 2026 vs Aug");
  assert.equal(comparisonLabel("last", { from: "2027-01", to: "2027-01" }, { from: "2026-12", to: "2026-12" }), "Jan 2027 vs Dec 2026");
  assert.equal(comparisonLabel("ytd", { from: "2027-01", to: "2027-03" }, { from: "2026-01", to: "2026-03" }), "Jan to Mar 2027 vs 2026");
});
