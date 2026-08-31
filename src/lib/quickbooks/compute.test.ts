import test from "node:test";
import assert from "node:assert/strict";
import { computeNoi, monthsOfData, type ComputeLine } from "./compute";
import type { QboCategory, QboLineTag, QboTreatment } from "@prisma/client";

/**
 * Anchored to HG's real portfolio P&L, Cash basis, Jan–Aug 2026
 * (_private/HG Capital Partners LLC_Profit and Loss.xlsx + _private/qbo-findings.md).
 * Amounts in cents.
 *
 *   QBO "Total Income"        135,240.97   (Rents 130,803.09 + Fees 4,437.88)
 *   QBO "Total Expenses"       38,547.48
 *   QBO "Net Operating Income" 96,693.49
 *   QBO "Net Income"           71,255.43
 *
 * We reclassify out of operating income: owner P2P $7,684.00 and one internal
 * transfer $750.00 mis-booked to Rents. So:
 *   operating income  126,806.97
 *   NOI                88,259.49
 *   cash flow a/d      14,611.35
 * And the identity holds:
 *   71,255.43 = cashFlowAfterDebt + bankInterest + excluded(suspense+transfer) + ownerFunded
 */

const QBO_NET_INCOME_CENTS = 7_125_543;

function line(
  treatment: QboTreatment,
  category: QboCategory,
  amountCents: number,
  opts: { tags?: QboLineTag[]; month?: string } = {},
): ComputeLine {
  return {
    treatment,
    category,
    amountCents,
    lineTags: opts.tags ?? [],
    periodMonth: opts.month ?? "2026-03",
  };
}

// One line per (account, treatment) — net-of-reclass account totals from the P&L.
const PORTFOLIO: ComputeLine[] = [
  // income
  line("OPERATING_INCOME", "RENT", 13_080_309 - 768_400 - 75_000), // Rents, less owner P2P & transfer
  line("NON_OPERATING", "RENT", 768_400, { tags: ["OWNER_FUNDED"] }),
  line("EXCLUDED", "RENT", 75_000, { tags: ["INTERNAL_TRANSFER"] }),
  line("OPERATING_INCOME", "OTHER_INCOME", 443_788), // Fees & Other Revenue

  // operating expense (net account totals)
  line("OPERATING_EXPENSE", "BANK_FEES", 200 + 1_200),
  line("OPERATING_EXPENSE", "INSURANCE", 614_185 - 379_390),
  line("OPERATING_EXPENSE", "LEGAL_PROFESSIONAL", 510_000 - 195_556),
  line("OPERATING_EXPENSE", "TAXES", 12_881 + 375_001 + 218_636),
  line("OPERATING_EXPENSE", "LEASING_COMMISSION", 74_500),
  line("OPERATING_EXPENSE", "OTHER_OPEX", -1_910_244, { tags: ["NEGATIVE_RECLASS"] }),
  line("OPERATING_EXPENSE", "REPAIRS", 1_622_546),
  line("OPERATING_EXPENSE", "SOFTWARE", 46_706),
  line("OPERATING_EXPENSE", "TRAVEL", 5_175),
  line("OPERATING_EXPENSE", "UNCATEGORIZED", 283_455),
  line("OPERATING_EXPENSE", "UTILITIES", 2_575_453),

  // below the line
  line("DEBT_INTEREST", "DEBT_INTEREST", 7_364_814),
  line("NON_OPERATING", "OTHER_INCOME", 27_575), // bank interest income
  line("EXCLUDED", "SUSPENSE", 4_793_433), // the Puleo Delisle escrow wire
];

test("portfolio operating income, expense, NOI tie to the real P&L", () => {
  const r = computeNoi(PORTFOLIO);
  assert.equal(r.operatingIncomeCents, 12_680_697, "operating income $126,806.97");
  assert.equal(r.operatingExpenseCents, 3_854_748, "operating expense $38,547.48 (= QBO Total Expenses)");
  assert.equal(r.noiCents, 8_825_949, "NOI $88,259.49");
  assert.equal(r.debtInterestCents, 7_364_814);
  assert.equal(r.cashFlowAfterDebtCents, 1_461_135, "cash flow after debt $14,611.35");
});

test("the net-income reconciliation identity holds to the cent", () => {
  const r = computeNoi(PORTFOLIO);
  const identity =
    r.cashFlowAfterDebtCents + r.nonOperatingIncomeCents + r.excludedCents + r.ownerFundedCents;
  assert.equal(identity, QBO_NET_INCOME_CENTS, "= QBO Net Income $71,255.43");
});

test("owner-funded and internal-transfer are memo-only, not in NOI", () => {
  const r = computeNoi(PORTFOLIO);
  assert.equal(r.ownerFundedCents, 768_400);
  assert.equal(r.excludedCents, 4_793_433 + 75_000, "suspense + the transfer");
  assert.equal(r.nonOperatingIncomeCents, 27_575, "bank interest only");
  // remove the owner-P2P line entirely -> NOI unchanged
  const withoutOwner = computeNoi(PORTFOLIO.filter((l) => !l.lineTags.includes("OWNER_FUNDED")));
  assert.equal(withoutOwner.noiCents, r.noiCents);
});

test("negative reclass lines are netted, never abs()'d", () => {
  const r = computeNoi(PORTFOLIO);
  // OTHER_OPEX is net -$19,102.44 and it drags NOI up, not down
  assert.equal(r.expenseByCategoryCents.OTHER_OPEX, -1_910_244);
  assert.equal(r.negativeReclassGrossCents, -1_910_244);
  // flipping it to abs would swing NOI by 2×
  const abs = computeNoi(
    PORTFOLIO.map((l) => (l.category === "OTHER_OPEX" ? { ...l, amountCents: 1_910_244 } : l)),
  );
  assert.equal(abs.noiCents - r.noiCents, -2 * 1_910_244);
});

test("NOI margin is null when operating income is zero or negative", () => {
  assert.equal(computeNoi([]).noiMargin, null);
  assert.equal(
    computeNoi([line("OPERATING_EXPENSE", "UTILITIES", 5000)]).noiMargin,
    null,
  );
  const r = computeNoi([
    line("OPERATING_INCOME", "RENT", 10_000),
    line("OPERATING_EXPENSE", "UTILITIES", 4_000),
  ]);
  assert.equal(r.noiMargin, 0.6);
});

test("monthsOfData spans first activity -> last complete month, not just months present", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-08"];
  assert.deepEqual(monthsOfData(months), { n: 8, first: "2026-01", last: "2026-08" });
  // synced through Aug (a partial month) -> data runs Jan..Jul = 7, even though
  // the last month with any activity is March
  assert.deepEqual(monthsOfData(months, { currentMonth: "2026-08" }), {
    n: 7,
    first: "2026-01",
    last: "2026-07",
  });
  // a property acquired mid-year -> denominator starts at ownership
  assert.deepEqual(monthsOfData(months, { ownershipStartMonth: "2026-03" }), {
    n: 6,
    first: "2026-03",
    last: "2026-08",
  });
  assert.equal(monthsOfData([]).n, 0);
});

test("computeNoi reports monthsOfData / annualization from the lines", () => {
  const r = computeNoi(
    [
      line("OPERATING_INCOME", "RENT", 100_000, { month: "2026-01" }),
      line("OPERATING_INCOME", "RENT", 100_000, { month: "2026-04" }),
    ],
    { currentMonth: "2026-09" },
  );
  assert.equal(r.monthsOfData, 8, "Jan..Aug, not just the 2 months with rent");
  assert.equal(r.annualizationFactor, 1.5);
});
