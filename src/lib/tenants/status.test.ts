import test from "node:test";
import assert from "node:assert/strict";
import { dayAfter, leaseEndsLabel, leaseStatus, livingLease, monthYear, nextLease, overlappingTerms, staysOverlap, termToday } from "./status";

const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

test("leaseStatus: blank dates live there now; they leave on movesOut; a future move-in is upcoming", () => {
  assert.equal(leaseStatus({ movesIn: null, movesOut: null }, "2026-11-14"), "current");
  assert.equal(leaseStatus({ movesIn: d("2025-03-01"), movesOut: null }, "2026-11-14"), "current");
  assert.equal(leaseStatus({ movesIn: d("2025-03-01"), movesOut: d("2026-11-15") }, "2026-11-14"), "current", "the day before they leave");
  assert.equal(leaseStatus({ movesIn: d("2025-03-01"), movesOut: d("2026-11-14") }, "2026-11-14"), "past", "the day they leave");
  assert.equal(leaseStatus({ movesIn: d("2026-11-15"), movesOut: null }, "2026-11-14"), "upcoming");
  assert.equal(leaseStatus({ movesIn: d("2026-11-14"), movesOut: null }, "2026-11-14"), "current", "the day they arrive");
  assert.equal(leaseStatus({ movesIn: "2026-11-14", movesOut: null }, "2026-11-14"), "current", "a Ymd string reads the same");
});

test("staysOverlap: back to back doesn't overlap; open ends do", () => {
  const old = { movesIn: d("2024-01-01"), movesOut: d("2026-02-01") };
  assert.equal(staysOverlap(old, { movesIn: d("2026-02-01"), movesOut: null }), false, "moves in the day the old one leaves");
  assert.equal(staysOverlap(old, { movesIn: d("2026-01-31"), movesOut: null }), true);
  assert.equal(staysOverlap({ movesIn: null, movesOut: null }, { movesIn: d("2030-01-01"), movesOut: null }), true, "nobody gave notice");
  assert.equal(staysOverlap({ movesIn: null, movesOut: d("2025-01-01") }, { movesIn: d("2025-01-01"), movesOut: null }), false);
});

test("livingLease and nextLease: by unit, today, and the later move-in when two match", () => {
  const today = "2026-11-14";
  const leases = [
    { id: "past", unitId: "front", movesIn: d("2023-03-01"), movesOut: d("2025-03-01") },
    { id: "now", unitId: "front", movesIn: d("2025-03-01"), movesOut: d("2027-01-31") },
    { id: "next", unitId: "front", movesIn: d("2027-01-31"), movesOut: null },
    { id: "later", unitId: "front", movesIn: d("2027-06-01"), movesOut: null },
    { id: "rear", unitId: "rear", movesIn: null, movesOut: null },
    { id: "house", unitId: null, movesIn: null, movesOut: null },
  ];
  assert.equal(livingLease(leases, "front", today)?.id, "now");
  assert.equal(nextLease(leases, "front", today)?.id, "next");
  assert.equal(livingLease(leases, "rear", today)?.id, "rear");
  assert.equal(nextLease(leases, "rear", today), null);
  assert.equal(livingLease(leases, null, today)?.id, "house", "a property with no units");
  assert.equal(livingLease(leases, "upper", today), null, "vacant");
  assert.equal(livingLease(leases, "front", "2027-01-31")?.id, "next", "on move day the new household lives there");
  const twin = [...leases, { id: "twin", unitId: "front", movesIn: d("2025-06-01"), movesOut: null }];
  assert.equal(livingLease(twin, "front", today)?.id, "twin");
});

test("termToday: in a term, month to month after the last, the first term before any starts", () => {
  const terms = [
    { id: "t2", startsOn: d("2026-03-01"), endsOn: d("2027-02-28") },
    { id: "t1", startsOn: d("2025-03-01"), endsOn: d("2026-02-28") },
  ];
  assert.deepEqual(termToday(terms, "2026-11-14"), { term: terms[0], monthToMonthSince: null });
  assert.deepEqual(termToday(terms, "2026-02-28"), { term: terms[1], monthToMonthSince: null }, "the last day of a term");
  assert.deepEqual(termToday(terms, "2027-02-28"), { term: terms[0], monthToMonthSince: null });
  assert.deepEqual(termToday(terms, "2027-03-01"), { term: terms[0], monthToMonthSince: "2027-03-01" });
  assert.deepEqual(termToday(terms, "2024-12-01"), { term: terms[1], monthToMonthSince: null }, "before any starts");
  assert.deepEqual(termToday([{ startsOn: d("2025-01-01"), endsOn: null }], "2026-11-14"), { term: { startsOn: d("2025-01-01"), endsOn: null }, monthToMonthSince: null });
  assert.equal(termToday([], "2026-11-14"), null);
});

test("overlappingTerms: the next may start the day after; sharing a day or an open end overlaps", () => {
  assert.equal(overlappingTerms([{ startsOn: d("2025-03-01"), endsOn: d("2026-02-28") }, { startsOn: d("2026-03-01"), endsOn: null }]), null);
  assert.ok(overlappingTerms([{ startsOn: d("2025-03-01"), endsOn: d("2026-03-01") }, { startsOn: d("2026-03-01"), endsOn: null }]));
  assert.ok(overlappingTerms([{ startsOn: d("2025-03-01"), endsOn: null }, { startsOn: d("2026-03-01"), endsOn: null }]));
});

test("dayAfter and monthYear", () => {
  assert.equal(dayAfter("2027-02-28"), "2027-03-01");
  assert.equal(dayAfter("2028-02-28"), "2028-02-29");
  assert.equal(dayAfter("2026-12-31"), "2027-01-01");
  assert.equal(monthYear(d("2027-02-28")), "Feb 2027");
  assert.equal(monthYear(null), "—");
});

test("leaseEndsLabel: a month, Monthly, Moved out, Moves in", () => {
  const today = "2026-11-14";
  const term = { startsOn: d("2026-03-01"), endsOn: d("2027-02-28") };
  assert.equal(leaseEndsLabel({ movesIn: d("2025-03-01"), movesOut: null }, [term], today), "Feb 2027");
  assert.equal(leaseEndsLabel({ movesIn: d("2025-03-01"), movesOut: null }, [{ startsOn: d("2025-03-01"), endsOn: null }], today), "Monthly");
  assert.equal(leaseEndsLabel({ movesIn: d("2024-03-01"), movesOut: null }, [{ startsOn: d("2024-03-01"), endsOn: d("2025-02-28") }], today), "Monthly");
  assert.equal(leaseEndsLabel({ movesIn: d("2023-03-01"), movesOut: d("2026-08-01") }, [term], today), "Moved out Aug 2026");
  assert.equal(leaseEndsLabel({ movesIn: d("2027-02-01"), movesOut: null }, [], today), "Moves in Feb 2027");
  assert.equal(leaseEndsLabel({ movesIn: null, movesOut: null }, [], today), "—");
});
