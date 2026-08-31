import type { QboCategory, QboLineTag, QboTreatment } from "@prisma/client";

/**
 * The locked NOI / cash-flow math. Pure; covered by compute.test.ts against the
 * real Jan–Aug 2026 P&L totals.
 *
 * Amount convention (from the ProfitAndLossDetail report): **income positive,
 * expense positive, contra/reclass negative**. NOI = operating income − operating
 * expense. `report-parse.ts` asserts each section's line-sum ties to its Summary,
 * so a convention surprise fails loudly instead of silently flipping a sign.
 *
 *   operating income  = RENT (incl. SUBSIDY, EXCL. OWNER_FUNDED) + other operating income
 *   operating expense = the 12 opex buckets, negatives netted, UNCATEGORIZED included
 *   NOI               = operating income − operating expense
 *   cash flow a/d     = NOI − debt interest        (principal is balance-sheet, not here)
 *
 * "Unattributed" (entity / overhead / no-class) activity is included in the
 * portfolio scope and excluded per-property; the caller filters by `propertyId`.
 */

export interface ComputeLine {
  treatment: QboTreatment;
  category: QboCategory;
  amountCents: number;
  lineTags: QboLineTag[];
  periodMonth: string; // "YYYY-MM"
}

export interface NoiResult {
  rentCents: number;
  otherIncomeCents: number;
  operatingIncomeCents: number;
  operatingExpenseCents: number;
  expenseByCategoryCents: Partial<Record<QboCategory, number>>;
  noiCents: number;
  noiMargin: number | null; // null when operating income ≤ 0
  debtInterestCents: number;
  cashFlowAfterDebtCents: number;

  // memo — shown, never folded into NOI
  nonOperatingIncomeCents: number; // bank interest
  ownerFundedCents: number; // "rent" that was an owner P2P
  subsidyCents: number; // Section-8 (a subset of rent, informational)
  excludedCents: number; // suspense, transfers, everything EXCLUDED
  excludedRentCents: number; // subset of excluded: rent-category lines (internal transfers)
  negativeReclassGrossCents: number; // Σ of negative expense lines (informational)

  monthsOfData: number;
  firstMonth: string | null;
  lastMonth: string | null;
  annualizationFactor: number; // 12 / monthsOfData; 0 when no data
}

export interface MonthsOfDataOpts {
  /** Exclude the running (incomplete) month, "YYYY-MM". */
  currentMonth?: string;
  /** Per-property: ignore stray pre-ownership classed lines. */
  ownershipStartMonth?: string | null;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function prevMonth(m: string): string {
  let [y, mo] = m.split("-").map(Number);
  mo -= 1;
  if (mo === 0) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * The denominator for annualization: the span from first activity (or ownership
 * start) to the last **complete** month. A property with rent in Jan and Apr,
 * synced through August, has 8 months of data (some zero), not 2 — dividing by 2
 * would triple its "monthly average".
 */
export function monthsOfData(months: string[], opts: MonthsOfDataOpts = {}) {
  const present = months.filter((m) => !opts.currentMonth || m < opts.currentMonth);
  if (present.length === 0) {
    return { n: 0, first: null as string | null, last: null as string | null };
  }
  let first = present.reduce((a, b) => (a < b ? a : b));
  if (opts.ownershipStartMonth && opts.ownershipStartMonth > first) {
    first = opts.ownershipStartMonth;
  }
  const lastPresent = present.reduce((a, b) => (a > b ? a : b));
  const last = opts.currentMonth ? prevMonth(opts.currentMonth) : lastPresent;
  if (first > last) return { n: 1, first, last: first };
  return { n: monthDiff(first, last) + 1, first, last };
}

export function computeNoi(lines: ComputeLine[], opts: MonthsOfDataOpts = {}): NoiResult {
  let rent = 0;
  let otherIncome = 0;
  let operatingExpense = 0;
  let debtInterest = 0;
  let nonOperatingIncome = 0;
  let ownerFunded = 0;
  let subsidy = 0;
  let excluded = 0;
  let excludedRent = 0;
  let negativeReclassGross = 0;
  const expenseByCategory: Partial<Record<QboCategory, number>> = {};
  const monthSet = new Set<string>();

  for (const l of lines) {
    monthSet.add(l.periodMonth);
    switch (l.treatment) {
      case "OPERATING_INCOME":
        if (l.category === "RENT") {
          rent += l.amountCents;
          if (l.lineTags.includes("SUBSIDY")) subsidy += l.amountCents;
        } else {
          otherIncome += l.amountCents;
        }
        break;
      case "OPERATING_EXPENSE":
        operatingExpense += l.amountCents;
        expenseByCategory[l.category] = (expenseByCategory[l.category] ?? 0) + l.amountCents;
        if (l.lineTags.includes("NEGATIVE_RECLASS") && l.amountCents < 0) {
          negativeReclassGross += l.amountCents;
        }
        break;
      case "DEBT_INTEREST":
        debtInterest += l.amountCents;
        break;
      case "NON_OPERATING":
        if (l.category === "RENT") ownerFunded += l.amountCents;
        else nonOperatingIncome += l.amountCents;
        break;
      case "EXCLUDED":
        excluded += l.amountCents;
        if (l.category === "RENT") excludedRent += l.amountCents;
        break;
    }
  }

  const operatingIncome = rent + otherIncome;
  const noi = operatingIncome - operatingExpense;
  const { n, first, last } = monthsOfData([...monthSet], opts);

  return {
    rentCents: rent,
    otherIncomeCents: otherIncome,
    operatingIncomeCents: operatingIncome,
    operatingExpenseCents: operatingExpense,
    expenseByCategoryCents: expenseByCategory,
    noiCents: noi,
    noiMargin: operatingIncome > 0 ? noi / operatingIncome : null,
    debtInterestCents: debtInterest,
    cashFlowAfterDebtCents: noi - debtInterest,
    nonOperatingIncomeCents: nonOperatingIncome,
    ownerFundedCents: ownerFunded,
    subsidyCents: subsidy,
    excludedCents: excluded,
    excludedRentCents: excludedRent,
    negativeReclassGrossCents: negativeReclassGross,
    monthsOfData: n,
    firstMonth: first,
    lastMonth: last,
    annualizationFactor: n > 0 ? 12 / n : 0,
  };
}
