import test from "node:test";
import assert from "node:assert/strict";
import type { QboClassRole } from "@prisma/client";
import { basisFromParam, comparePropertyRows, inOutCents, splitByProperty } from "./rollup";

test("basisFromParam: explicit cash or accrual overrides, anything else defers to Settings", () => {
  assert.equal(basisFromParam("accrual"), "ACCRUAL");
  assert.equal(basisFromParam("cash"), "CASH");
  assert.equal(basisFromParam(["accrual", "cash"]), "ACCRUAL");
  assert.equal(basisFromParam(undefined), undefined);
  assert.equal(basisFromParam(""), undefined);
  assert.equal(basisFromParam("ACCRUAL"), undefined);
});

const line = (id: string, propertyId: string | null, classRole: QboClassRole) => ({ id, propertyId, classRole });

test("splitByProperty: every mapped property gets a row, even with no lines", () => {
  const { byProperty, unassigned } = splitByProperty(
    [line("a", "p1", "PROPERTY"), line("b", "p1", "PROPERTY")],
    ["p1", "p2"],
  );
  assert.deepEqual([...byProperty.keys()], ["p1", "p2"]);
  assert.deepEqual(byProperty.get("p1")!.map((l) => l.id), ["a", "b"]);
  assert.deepEqual(byProperty.get("p2"), []);
  assert.deepEqual(unassigned, []);
});

test("splitByProperty: entity, overhead, unmapped and no-class lines are not assigned to a property", () => {
  const { byProperty, unassigned } = splitByProperty(
    [
      line("ent", null, "ENTITY"),
      line("ovh", null, "OVERHEAD"),
      line("unm", null, "UNMAPPED"),
      // a stale propertyId on a class whose role is no longer PROPERTY stays unassigned
      line("stale", "p1", "UNMAPPED"),
      line("prop", "p1", "PROPERTY"),
    ],
    [],
  );
  assert.deepEqual([...byProperty.keys()], ["p1"]);
  assert.deepEqual(byProperty.get("p1")!.map((l) => l.id), ["prop"]);
  assert.deepEqual(unassigned.map((l) => l.id), ["ent", "ovh", "unm", "stale"]);
});

test("comparePropertyRows: by NOI, highest first, with no-activity rows last by address", () => {
  const rows = [
    { address: "9 Quiet St", hasActivity: false, noiCents: 0 },
    { address: "1 Low St", hasActivity: true, noiCents: -5_000 },
    { address: "2 Empty Ave", hasActivity: false, noiCents: 0 },
    { address: "3 High St", hasActivity: true, noiCents: 90_000 },
    { address: "4 Even St", hasActivity: true, noiCents: 0 },
  ];
  assert.deepEqual(
    [...rows].sort(comparePropertyRows).map((r) => r.address),
    ["3 High St", "4 Even St", "1 Low St", "2 Empty Ave", "9 Quiet St"],
  );
});

test("inOutCents: income and expense stay apart instead of adding up", () => {
  // the review's real case: $5,080.27 of income and $6,984.39 of expense on unclassed lines
  const r = inOutCents([
    { classification: "Revenue", treatment: "OPERATING_INCOME", cents: 508_027 },
    { classification: "Expense", treatment: "OPERATING_EXPENSE", cents: 698_439 },
  ]);
  assert.deepEqual(r, { inCents: 508_027, outCents: 698_439 });
});

test("inOutCents: the account's classification wins over the treatment", () => {
  const r = inOutCents([
    { classification: "Revenue", treatment: "NON_OPERATING", cents: 1_000 }, // bank interest
    { classification: "Revenue", treatment: "EXCLUDED", cents: 2_000 }, // suspense deposit
    { classification: "Expense", treatment: "DEBT_INTEREST", cents: 3_000 },
    { classification: "Expense", treatment: "EXCLUDED", cents: 4_000 }, // capex
    { classification: "Expense", treatment: "OPERATING_EXPENSE", cents: -500 }, // refund nets
  ]);
  assert.deepEqual(r, { inCents: 3_000, outCents: 6_500 });
});

test("inOutCents: an unknown account falls back to the treatment", () => {
  const r = inOutCents([
    { classification: "", treatment: "OPERATING_INCOME", cents: 100 },
    { classification: "", treatment: "OPERATING_EXPENSE", cents: 200 },
    { classification: "", treatment: "DEBT_INTEREST", cents: 300 },
  ]);
  assert.deepEqual(r, { inCents: 100, outCents: 500 });
});
