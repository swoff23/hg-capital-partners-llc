import { parseAmount, toDecimalString } from "@/lib/money";

/**
 * Reading the numbers people type into the property editors. A blank field
 * clears the value; anything else must be one clean number. A typo used to be
 * stored as null, so "55o,000" quietly erased a $550,000 value. Now it's an
 * error that names the field, and nothing is written. Pure; see numbers.test.ts.
 */

export type NumberRead<T> = { ok: true; value: T | null } | { ok: false };

/** Money and months: "550,000", "$550k". */
export function readAmount(raw: string | null | undefined): NumberRead<string> {
  const s = raw?.trim();
  if (!s) return { ok: true, value: null };
  const n = parseAmount(s);
  return n == null ? { ok: false } : { ok: true, value: toDecimalString(n) };
}

/**
 * An interest rate in percent, kept to three decimals ("6.875", "6.875%") to
 * match its Decimal(6,3) column. Anything outside 0 to 100 is a typo ("6875"
 * with the point forgotten), refused rather than overflowing the column.
 */
export function readRate(raw: string | null | undefined): NumberRead<string> {
  const s = raw?.trim();
  if (!s) return { ok: true, value: null };
  const n = parseAmount(s);
  return n == null || n < 0 || n > 100 ? { ok: false } : { ok: true, value: n.toFixed(3) };
}

/** Whole, non-negative counts such as square feet: "2,300". */
export function readWholeNumber(raw: string | null | undefined): NumberRead<number> {
  const s = raw?.trim().replace(/[,\s]/g, "");
  if (!s) return { ok: true, value: null };
  return /^\d+$/.test(s) ? { ok: true, value: parseInt(s, 10) } : { ok: false };
}

const LABELS: Record<string, string> = {
  value: "Value",
  replacementCost: "Replacement cost",
  purchasePrice: "Purchase price",
  closingCosts: "Closing costs",
  rehabAmount: "Rehab amount",
  rehabMonths: "Rehab months",
  loanOriginalAmount: "Original amount",
  currentLoan: "Current loan",
  loanRate: "Rate",
  loanPaymentMonthly: "Payment / mo",
  insuranceCoverage: "Coverage",
  insuranceDeductible: "Deductible",
  insurancePremium: "Premium",
  sqft: "Sq ft",
};

/**
 * One short line naming the fields that didn't read, for the editor to show.
 * Short enough to stay on one line in the narrow section cards.
 */
export function badNumbersMessage(fields: string[]): string {
  if (fields.length === 1) {
    const [f] = fields;
    if (f === "loanRate") return "Rate needs a percentage, like 6.875.";
    if (f === "sqft") return "Sq ft isn't a whole number.";
    return `${LABELS[f] ?? f} isn't a number.`;
  }
  const labels = fields.map((f) => LABELS[f] ?? f);
  return `Check ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}.`;
}
