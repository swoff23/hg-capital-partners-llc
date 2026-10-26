import test from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_VIEWS,
  dealsWhere,
  emptyDeals,
  isFiltered,
  parseDealFilters,
  viewCounts,
  viewStages,
  type DealFilters,
  type DealView,
} from "./query";

type Row = Record<string, unknown>;

/** A stand-in for Postgres over the clauses query.ts builds: AND, equality, `in` and `contains`. */
function matches(row: Row, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([field, filter]) => {
    if (field === "AND") return (filter as Row[]).every((c) => matches(row, c));
    if (field === "OR") return (filter as Row[]).some((c) => matches(row, c));
    const value = row[field];
    const f = filter as Row;
    if ("in" in f) return (f.in as unknown[]).includes(value);
    if ("contains" in f) return typeof value === "string" && value.toLowerCase().includes(String(f.contains).toLowerCase());
    return value === filter;
  });
}

const DEALS: Row[] = [
  { id: "high", status: "1 - High", address: "767 Prospect Avenue, Buffalo" },
  { id: "medium", status: "2 - Medium", address: "15 Oxford Ave., Buffalo" },
  { id: "tbd", status: "5 - TBD", address: "647 Prospect Ave., Buffalo" },
  { id: "holding", status: "6 - Holding", address: "933 Lafayette Avenue, Buffalo" },
  { id: "closed", status: "CLOSED!", address: "58 Mariner St, Buffalo" },
  { id: "pass", status: "Pass", address: "22 Prospect Ave, Buffalo" },
];
const filters = (over: Partial<DealFilters> = {}): DealFilters => ({ view: "active", stages: [], q: "", sort: "status", ...over });
const found = (f: DealFilters) => DEALS.filter((d) => matches(d, dealsWhere(f) as Row)).map((d) => d.id);

test("the six views, Active first", () => {
  assert.deepEqual(
    DEAL_VIEWS.map((v) => v.label),
    ["Active", "TBD", "Holding", "Closed", "Pass", "All"],
  );
});

test("parseDealFilters: Active by default, and a view never goes null under the chip", () => {
  assert.deepEqual(parseDealFilters({}), { view: "active", stages: [], q: "", sort: "status" });
  assert.equal(parseDealFilters({ status: "6 - Holding" }).view, "6 - Holding");
  assert.equal(parseDealFilters({ status: "CLOSED!" }).view, "CLOSED!");
  assert.equal(parseDealFilters({ status: "all" }).view, "all");
  assert.equal(parseDealFilters({ status: "nonsense" }).view, "active");
  assert.equal(parseDealFilters({ q: "  prospect " }).q, "prospect");
  assert.equal(parseDealFilters({ sort: "-theirPrice" }).sort, "-theirPrice");
});

test("parseDealFilters: the Stage chip narrows inside Active and All and nowhere else", () => {
  assert.deepEqual(parseDealFilters({ statuses: "1 - High,2 - Medium" }).stages, ["1 - High", "2 - Medium"]);
  assert.deepEqual(parseDealFilters({ status: "all", statuses: "Pass,1 - High" }).stages, ["Pass", "1 - High"]);
  assert.deepEqual(parseDealFilters({ status: "active", statuses: "Pass,1 - High" }).stages, ["1 - High"], "Pass isn't in Active");
  assert.deepEqual(parseDealFilters({ status: "Pass", statuses: "Pass" }).stages, [], "a one-stage view has no chip");
  assert.deepEqual(parseDealFilters({ status: "all", statuses: "Active,1 - High" }).stages, ["1 - High"], "a stage that doesn't exist falls away");
});

test("parseDealFilters: an old link with stages and no view meant those stages, anywhere", () => {
  const f = parseDealFilters({ statuses: "Pass,6 - Holding" });
  assert.equal(f.view, "all");
  assert.deepEqual(f.stages, ["Pass", "6 - Holding"]);
  assert.deepEqual(found(f), ["holding", "pass"]);
});

test("parseDealFilters: what the bar writes reads back as the view it was written in", () => {
  // Active is the default, so the bar drops `status` and keeps the chip's picks.
  const active = parseDealFilters({ statuses: "1 - High" });
  assert.equal(active.view, "active");
  assert.deepEqual(active.stages, ["1 - High"]);
  assert.equal(parseDealFilters({ statuses: "1 - High,2 - Medium,3 - Low,4 - To Schedule" }).view, "active");
  assert.deepEqual(found(active), ["high"]);
  // A pick outside Active can only come from an old link, which meant "anywhere".
  assert.equal(parseDealFilters({ statuses: "1 - High,Pass" }).view, "all");
});

test("the views pick the part of the pipeline", () => {
  assert.deepEqual(found(filters()), ["high", "medium"]);
  assert.deepEqual(found(filters({ view: "5 - TBD" })), ["tbd"]);
  assert.deepEqual(found(filters({ view: "6 - Holding" })), ["holding"]);
  assert.deepEqual(found(filters({ view: "CLOSED!" })), ["closed"]);
  assert.deepEqual(found(filters({ view: "Pass" })), ["pass"]);
  assert.equal(found(filters({ view: "all" })).length, 6);
  assert.deepEqual(viewStages("active"), ["1 - High", "2 - Medium", "3 - Low", "4 - To Schedule"]);
});

test("the Stage chip narrows inside the view", () => {
  assert.deepEqual(found(filters({ stages: ["1 - High"] })), ["high"]);
  assert.deepEqual(found(filters({ view: "all", stages: ["1 - High", "Pass"] })), ["high", "pass"]);
});

test("search runs on the address, in any word order, Avenue or Ave", () => {
  assert.deepEqual(found(filters({ view: "all", q: "Prospect Avenue" })), ["high", "tbd", "pass"]);
  assert.deepEqual(found(filters({ view: "all", q: "ave prospect 647" })), ["tbd"]);
  assert.deepEqual(found(filters({ q: "prospect" })), ["high"], "inside Active only");
});

test("counts: each view sums its stages, with the search applied by the caller's grouping", () => {
  const counts = viewCounts({ "1 - High": 1, "2 - Medium": 3, "5 - TBD": 17, "6 - Holding": 206, "CLOSED!": 11, Pass: 428, Active: 2 });
  assert.equal(counts.active, 4);
  assert.equal(counts["5 - TBD"], 17);
  assert.equal(counts["6 - Holding"], 206);
  assert.equal(counts["CLOSED!"], 11);
  assert.equal(counts.Pass, 428);
  assert.equal(counts.all, 668, "All counts a legacy stage too");
});

test("isFiltered: only the opening state is plain", () => {
  assert.equal(isFiltered(filters()), false);
  assert.equal(isFiltered(filters({ view: "all" })), true);
  assert.equal(isFiltered(filters({ stages: ["1 - High"] })), true);
  assert.equal(isFiltered(filters({ q: "x" })), true);
  assert.equal(isFiltered(filters({ sort: "-updated" })), true);
});

const counts = (all: number): Record<DealView, number> => ({ active: 0, "5 - TBD": 0, "6 - Holding": 0, "CLOSED!": 0, Pass: 0, all });

test("an empty list: a search that hits in another view offers those", () => {
  const e = emptyDeals(filters({ q: "prospect" }), counts(18));
  assert.equal(e.line, "No Active deals match “prospect”.");
  assert.deepEqual(e.action, { kind: "show-all", count: 18 });
  assert.equal(emptyDeals(filters({ view: "5 - TBD", q: "prospect" }), counts(2)).line, "No TBD deals match “prospect”.");
});

test("an empty list: the chip hiding a search's hits offers Clear filters", () => {
  const e = emptyDeals(filters({ q: "prospect", stages: ["3 - Low"] }), { ...counts(18), active: 1 });
  assert.equal(e.line, "No deals match these filters.");
  assert.deepEqual(e.action, { kind: "clear-filters" });
  // Nothing in the view matches the search at all: the search is what to clear.
  assert.deepEqual(emptyDeals(filters({ q: "zzz", stages: ["3 - Low"] }), counts(0)).action, { kind: "clear-search" });
});

test("an empty list: a search that hits nowhere offers Clear search", () => {
  const e = emptyDeals(filters({ q: "zzz" }), counts(0));
  assert.equal(e.line, "No deals match “zzz”.");
  assert.deepEqual(e.action, { kind: "clear-search" });
  // In All there is nowhere else to look.
  assert.deepEqual(emptyDeals(filters({ view: "all", q: "zzz" }), counts(0)).action, { kind: "clear-search" });
});

test("an empty list: the chip alone offers Clear filters; a bare view has no way out to offer", () => {
  const chip = emptyDeals(filters({ stages: ["3 - Low"] }), counts(0));
  assert.equal(chip.line, "No deals match these filters.");
  assert.deepEqual(chip.action, { kind: "clear-filters" });
  assert.deepEqual(emptyDeals(filters({ view: "6 - Holding" }), counts(0)), { line: "No deals in Holding.", action: null });
  assert.equal(emptyDeals(filters({ view: "all" }), counts(0)).line, "No deals yet. New ones show up here.");
});
