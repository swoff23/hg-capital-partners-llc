import test from "node:test";
import assert from "node:assert/strict";
import { userMessage } from "@/lib/action-result";
import { tenantedUnitLine } from "./units-write";

// The refusal for deleting a unit with tenants (docs/specs/tenants.md decision 6). The database side is units.pg.test.ts.

const TODAY = "2026-11-14";

test("a unit with someone living there gets decision 6's line, whatever is coming next", () => {
  assert.equal(tenantedUnitLine("Front", [{ movesIn: "2025-03-01", movesOut: null }], TODAY), "Front has current tenants. End their lease first.");
  // An import with no dates lives there now; a household moving in later doesn't change the line.
  assert.equal(
    tenantedUnitLine("Front", [{ movesIn: null, movesOut: "2026-12-01" }, { movesIn: "2026-12-01", movesOut: null }], TODAY),
    "Front has current tenants. End their lease first.",
  );
});

test("a unit with only a household still to come says when the first one moves in", () => {
  const leases = [{ movesIn: "2027-03-01", movesOut: null }, { movesIn: "2026-12-01", movesOut: "2027-03-01" }, { movesIn: "2020-01-01", movesOut: "2021-01-01" }];
  assert.equal(tenantedUnitLine("Rear", leases, TODAY), "Rear has tenants moving in Dec 1. Delete their lease first.");
  // Next year's date carries its year.
  assert.equal(tenantedUnitLine("Rear", [{ movesIn: "2027-02-01", movesOut: null }], TODAY), "Rear has tenants moving in Feb 1, 2027. Delete their lease first.");
});

test("the line reaches the screen as written, a long unit name cut so it stays one people read", () => {
  const line = tenantedUnitLine("Front", [{ movesIn: null, movesOut: null }], TODAY);
  // A thrown Error passes through to the Units editor only as a sentence of 200 characters or fewer.
  assert.equal(userMessage(new Error(line)), line);
  const long = tenantedUnitLine("A".repeat(150), [{ movesIn: "2027-02-01", movesOut: null }], TODAY);
  assert.equal(long, `${"A".repeat(59)}… has tenants moving in Feb 1, 2027. Delete their lease first.`);
  assert.equal(userMessage(new Error(long)), long);
});
