import test from "node:test";
import assert from "node:assert/strict";
import { computeNoi } from "./compute";
import { trailingMonths } from "./months";
import { changeWords, expenseBreakdown, monthSeries, purchaseMonth, rentRollGrid, type SeriesLine } from "./series";

/** A line with the fields the series read; the rest default to an operating expense on no class. */
function line(over: Partial<SeriesLine>): SeriesLine {
  return {
    treatment: "OPERATING_EXPENSE",
    category: "REPAIRS",
    amountCents: 0,
    lineTags: [],
    periodMonth: "2026-09",
    propertyId: null,
    classRole: "UNMAPPED",
    accountName: "Repairs",
    name: null,
    ...over,
  };
}

const LINES: SeriesLine[] = [
  // September: $12,400 in, $8,190 out, NOI $4,210
  line({ treatment: "OPERATING_INCOME", category: "RENT", amountCents: 1_000_000, accountName: "Rents", name: "Tenant A" }),
  line({ treatment: "OPERATING_INCOME", category: "OTHER_INCOME", amountCents: 240_000, accountName: "Late fees", name: "Tenant B" }),
  line({ amountCents: 500_000, accountName: "Repairs", name: "Zack Plumbing" }),
  line({ category: "UTILITIES", amountCents: 329_000, accountName: "National Grid", name: "National Grid" }),
  line({ amountCents: -10_000, accountName: "Repairs", name: "Zack Plumbing", lineTags: ["NEGATIVE_RECLASS"] }),
  // Below NOI and out of the chart: interest and a transfer
  line({ treatment: "DEBT_INTEREST", category: "DEBT_INTEREST", amountCents: 85_000, accountName: "Mortgage interest" }),
  line({ treatment: "EXCLUDED", category: "SUSPENSE", amountCents: 77_700, accountName: "Clearing" }),
  // March: a net refund month, expense below zero
  line({ periodMonth: "2026-03", amountCents: -4_500, accountName: "Repairs", name: null }),
  // August 2025: outside the window
  line({ periodMonth: "2025-08", treatment: "OPERATING_INCOME", category: "RENT", amountCents: 99_900 }),
];

test("monthSeries: every month of the window, empty ones at zero", () => {
  const s = monthSeries(LINES, trailingMonths("2026-10"));
  assert.equal(s.length, 12);
  assert.deepEqual(
    s.map((m) => m.periodMonth),
    ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  );
  const sep = s[10];
  assert.deepEqual(sep, { periodMonth: "2026-09", incomeCents: 1_240_000, expenseCents: 819_000, noiCents: 421_000, lineCount: 7 });
  // A net refund month: expense below zero, NOI above it.
  assert.deepEqual(s[4], { periodMonth: "2026-03", incomeCents: 0, expenseCents: -4_500, noiCents: 4_500, lineCount: 1 });
  // No lines at all.
  assert.deepEqual(s[11], { periodMonth: "2026-10", incomeCents: 0, expenseCents: 0, noiCents: 0, lineCount: 0 });
});

test("monthSeries: a month's NOI is computeNoi's for the same lines", () => {
  const sepLines = LINES.filter((l) => l.periodMonth === "2026-09");
  const noi = computeNoi(sepLines);
  const [sep] = monthSeries(sepLines, ["2026-09"]);
  assert.equal(sep.incomeCents, noi.operatingIncomeCents);
  assert.equal(sep.expenseCents, noi.operatingExpenseCents);
  assert.equal(sep.noiCents, noi.noiCents);
});

test("expenseBreakdown by category, account and payee", () => {
  const sep = LINES.filter((l) => l.periodMonth === "2026-09");
  // Repairs 5,000 - 100 = 4,900; Utilities 3,290
  assert.deepEqual(expenseBreakdown(sep, "category"), [
    { key: "REPAIRS", cents: 490_000 },
    { key: "UTILITIES", cents: 329_000 },
  ]);
  assert.deepEqual(expenseBreakdown(sep, "account"), [
    { key: "Repairs", cents: 490_000 },
    { key: "National Grid", cents: 329_000 },
  ]);
  assert.deepEqual(expenseBreakdown(sep, "payee"), [
    { key: "Zack Plumbing", cents: 490_000 },
    { key: "National Grid", cents: 329_000 },
  ]);
  // Every breakdown sums to operating expense.
  for (const by of ["category", "account", "payee"] as const) {
    assert.equal(
      expenseBreakdown(sep, by).reduce((s, r) => s + r.cents, 0),
      computeNoi(sep).operatingExpenseCents,
    );
  }
});

test("expenseBreakdown: no payee shares one key, a refund group sorts last, a zero group drops", () => {
  const lines = [
    line({ amountCents: 30_000, name: "  Home Depot " }),
    line({ amountCents: 12_000, name: "Home Depot" }),
    line({ amountCents: 5_000, name: null }),
    line({ amountCents: 2_000, name: "" }),
    line({ amountCents: -8_000, name: "Refund Co" }),
    line({ amountCents: 1_000, name: "Wash" }),
    line({ amountCents: -1_000, name: "Wash" }),
  ];
  assert.deepEqual(expenseBreakdown(lines, "payee"), [
    { key: "Home Depot", cents: 42_000 },
    { key: "", cents: 7_000 },
    { key: "Refund Co", cents: -8_000 },
  ]);
});

test("changeWords: whole dollars in words", () => {
  assert.equal(changeWords(1_240_000, 1_209_000), "Up $310");
  assert.equal(changeWords(700_000, 820_000), "Down $1,200");
  assert.equal(changeWords(500_049, 500_000), "No change");
  assert.equal(changeWords(-20_000, 10_000), "Down $300");
});

test("rentRollGrid: rows, the unassigned row, owner-funded apart, and the window", () => {
  const rent = (over: Partial<SeriesLine>) =>
    line({ treatment: "OPERATING_INCOME", category: "RENT", accountName: "Rents", ...over });
  const lines = [
    rent({ propertyId: "a", classRole: "PROPERTY", periodMonth: "2026-08", amountCents: 145_000 }),
    rent({ propertyId: "a", classRole: "PROPERTY", periodMonth: "2026-09", amountCents: 145_000 }),
    rent({ propertyId: "a", classRole: "PROPERTY", periodMonth: "2026-09", amountCents: 60_000, lineTags: ["SUBSIDY"] }),
    // Owner money booked to Rents: shown on its row, never in a total
    rent({ propertyId: "a", classRole: "PROPERTY", periodMonth: "2026-09", amountCents: 50_000, treatment: "NON_OPERATING", lineTags: ["OWNER_FUNDED"] }),
    rent({ propertyId: "b", classRole: "PROPERTY", periodMonth: "2026-09", amountCents: 120_000 }),
    // A transfer between accounts: no rent
    rent({ propertyId: "b", classRole: "PROPERTY", periodMonth: "2026-09", amountCents: 9_999, treatment: "EXCLUDED", lineTags: ["INTERNAL_TRANSFER"] }),
    // No property's class: the unassigned row
    rent({ propertyId: null, classRole: "UNMAPPED", periodMonth: "2026-09", amountCents: 31_000 }),
    rent({ propertyId: "c", classRole: "ENTITY", periodMonth: "2026-08", amountCents: 4_000 }),
    rent({ propertyId: null, classRole: "OVERHEAD", periodMonth: "2026-08", amountCents: 7_000, treatment: "NON_OPERATING", lineTags: ["OWNER_FUNDED"] }),
    // Before the window
    rent({ propertyId: "a", classRole: "PROPERTY", periodMonth: "2025-10", amountCents: 145_000 }),
  ];
  const g = rentRollGrid(lines, trailingMonths("2026-10"));
  assert.deepEqual(g.rows, [
    { propertyId: "a", byMonth: { "2026-08": 145_000, "2026-09": 205_000 }, totalCents: 350_000, subsidyCents: 60_000, ownerFundedCents: 50_000 },
    { propertyId: "b", byMonth: { "2026-09": 120_000 }, totalCents: 120_000, subsidyCents: 0, ownerFundedCents: 0 },
  ]);
  assert.deepEqual(g.unassigned, { byMonth: { "2026-09": 31_000, "2026-08": 4_000 }, totalCents: 35_000 });
  // Aug: 1,450 + 40; Sep: 2,050 + 1,200 + 310
  assert.deepEqual(g.portfolioByMonth, { "2026-08": 149_000, "2026-09": 356_000 });
  assert.equal(g.portfolioTotalCents, 505_000);
  // The Portfolio row is the Overview's rent for the same months.
  const inWindow = lines.filter((l) => l.periodMonth >= "2025-11");
  assert.equal(g.portfolioTotalCents, computeNoi(inWindow).rentCents);
});

test("rentRollGrid: no unassigned rent means no unassigned row", () => {
  const g = rentRollGrid(
    [line({ treatment: "OPERATING_INCOME", category: "RENT", propertyId: "a", classRole: "PROPERTY", amountCents: 100 })],
    ["2026-09"],
  );
  assert.equal(g.unassigned, null);
  assert.equal(g.portfolioTotalCents, 100);
});

test("purchaseMonth reads the stored UTC date", () => {
  assert.equal(purchaseMonth(new Date("2025-07-16T00:00:00Z")), "2025-07");
  assert.equal(purchaseMonth(new Date("2026-01-01T00:00:00Z")), "2026-01");
  assert.equal(purchaseMonth(null), null);
});
