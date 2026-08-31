import test from "node:test";
import assert from "node:assert/strict";
import { byClassNetCents, checkReconciliation, type ReconcileInput } from "./reconcile";
import { computeNoi, type ComputeLine } from "./compute";
import type { PnlByClassCell } from "./types";

const CELLS: PnlByClassCell[] = [
  { accountQboId: "acc_rent", accountName: "Rents", classQboId: "clsA", className: "A", section: "Income", amountCents: 100_000 },
  { accountQboId: "acc_rent", accountName: "Rents", classQboId: "clsB", className: "B", section: "Income", amountCents: 200_000 },
  { accountQboId: "acc_rent", accountName: "Rents", classQboId: null, className: "Not Specified", section: "Income", amountCents: 5_000 },
  { accountQboId: "acc_elec", accountName: "Electric", classQboId: "clsA", className: "A", section: "Expenses", amountCents: 30_000 },
  { accountQboId: "acc_int", accountName: "Interest expense", classQboId: "clsB", className: "B", section: "OtherExpenses", amountCents: 40_000 },
  { accountQboId: "acc_susp", accountName: "Suspense Receipts", classQboId: "clsB", className: "B", section: "OtherIncome", amountCents: 12_000 },
];

const PLAIN_NET_INCOME = 247_000; // (100k+200k+5k+12k) - (30k+40k)

const LINES: ComputeLine[] = [
  { treatment: "OPERATING_INCOME", category: "RENT", amountCents: 305_000, lineTags: [], periodMonth: "2026-03" },
  { treatment: "OPERATING_EXPENSE", category: "UTILITIES", amountCents: 30_000, lineTags: [], periodMonth: "2026-03" },
  { treatment: "DEBT_INTEREST", category: "DEBT_INTEREST", amountCents: 40_000, lineTags: [], periodMonth: "2026-03" },
  { treatment: "EXCLUDED", category: "SUSPENSE", amountCents: 12_000, lineTags: [], periodMonth: "2026-03" },
];

const LEDGER = new Map<string, number>([
  ["acc_rent::clsA", 100_000],
  ["acc_rent::clsB", 200_000],
  ["acc_rent::__UNCLASSED__", 5_000],
  ["acc_elec::clsA", 30_000],
  ["acc_int::clsB", 40_000],
  ["acc_susp::clsB", 12_000],
]);

const QBO_NET_OPERATING_INCOME = 275_000; // rents 305k − electric 30k (suspense/interest are below the line)

function input(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    byClassCells: CELLS,
    plainNetIncomeCents: PLAIN_NET_INCOME,
    qboNetOperatingIncomeCents: QBO_NET_OPERATING_INCOME,
    ledgerCellSums: LEDGER,
    noi: computeNoi(LINES),
    ...overrides,
  };
}

test("byClassNetCents = income sections − expense sections", () => {
  assert.equal(byClassNetCents(CELLS), PLAIN_NET_INCOME);
});

test("a clean sync passes every check", () => {
  const r = checkReconciliation(input());
  assert.ok(r.sumToWhole.ok, JSON.stringify(r.sumToWhole));
  assert.ok(r.netIncomeIdentity.ok, JSON.stringify(r.netIncomeIdentity));
  assert.ok(r.noiVsQbo.ok, JSON.stringify(r.noiVsQbo));
  assert.equal(r.cellMismatches.length, 0);
  assert.ok(r.ok);
});

test("sum-to-whole fails when a line is dropped from the by-class parse", () => {
  const r = checkReconciliation(input({ byClassCells: CELLS.slice(1) })); // drop the 100k rent cell
  assert.equal(r.sumToWhole.ok, false);
  assert.equal(r.sumToWhole.deltaCents, -100_000);
  assert.equal(r.ok, false);
});

test("noiVsQbo catches suspense mis-bucketed into operating income", () => {
  // the conservation identity still holds (same total, re-partitioned) — but
  // our NOI would be inflated $120 above QBO's Net Operating Income.
  const bad = computeNoi(
    LINES.map((l) =>
      l.category === "SUSPENSE"
        ? { ...l, treatment: "OPERATING_INCOME" as const, category: "OTHER_INCOME" as const }
        : l,
    ),
  );
  const r = checkReconciliation(input({ noi: bad }));
  assert.ok(r.netIncomeIdentity.ok, "conservation identity is blind to re-bucketing");
  assert.equal(r.noiVsQbo.ok, false);
  assert.equal(r.noiVsQbo.residualCents, 12_000);
  assert.equal(r.ok, false);
});

test("noiVsQbo accepts the known owner-funded reclass", () => {
  const lines: ComputeLine[] = [
    { treatment: "OPERATING_INCOME", category: "RENT", amountCents: 300_000, lineTags: [], periodMonth: "2026-03" },
    { treatment: "NON_OPERATING", category: "RENT", amountCents: 5_000, lineTags: ["OWNER_FUNDED"], periodMonth: "2026-03" },
    { treatment: "OPERATING_EXPENSE", category: "UTILITIES", amountCents: 30_000, lineTags: [], periodMonth: "2026-03" },
  ];
  // QBO's NOI includes the $50 owner P2P: 305k − 30k = 275k. Ours: 300k − 30k = 270k.
  const r = checkReconciliation(input({ noi: computeNoi(lines), qboNetOperatingIncomeCents: 275_000 }));
  assert.ok(r.noiVsQbo.ok, JSON.stringify(r.noiVsQbo));
  assert.equal(r.noiVsQbo.expectedDeltaCents, -5_000);
});

test("per-cell mismatch surfaces the offending account × class", () => {
  const ledger = new Map(LEDGER);
  ledger.set("acc_elec::clsA", 29_000); // $10 short
  const r = checkReconciliation(input({ ledgerCellSums: ledger }));
  assert.equal(r.cellMismatches.length, 1);
  assert.equal(r.cellMismatches[0].accountQboId, "acc_elec");
  assert.equal(r.cellMismatches[0].deltaCents, -1_000);
  assert.equal(r.ok, false);
});

test("a ledger cell with no matching report cell is flagged", () => {
  const ledger = new Map(LEDGER);
  ledger.set("acc_ghost::clsA", 9_999);
  const r = checkReconciliation(input({ ledgerCellSums: ledger }));
  assert.ok(r.cellMismatches.some((m) => m.accountQboId === "acc_ghost"));
});
