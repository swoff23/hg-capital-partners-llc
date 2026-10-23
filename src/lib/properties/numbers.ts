import { parseAmount, toDecimalString } from "@/lib/money";

/**
 * Reading the numbers people type into the property editors. A blank field
 * clears the value; anything else must be one clean number. A typo used to be
 * stored as null, so "55o,000" quietly erased a $550,000 value. Now it's an
 * error that names the field, and nothing is written. Pure; see numbers.test.ts.
 */

export type NumberRead<T> = { ok: true; value: T | null } | { ok: false };

/** Money, rates and months: "550,000", "$550k", "7.25%". */
export function readAmount(raw: string | null | undefined): NumberRead<string> {
  const s = raw?.trim();
  if (!s) return { ok: true, value: null };
  const n = parseAmount(s);
  return n == null ? { ok: false } : { ok: true, value: toDecimalString(n) };
}

/** Whole, non-negative counts such as square feet: "2,300". */
export function readWholeNumber(raw: string | null | undefined): NumberRead<number> {
  const s = raw?.trim().replace(/[,\s]/g, "");
  if (!s) return { ok: true, value: null };
  return /^\d+$/.test(s) ? { ok: true, value: parseInt(s, 10) } : { ok: false };
}

const FIELDS: Record<string, { label: string; example: string; whole?: boolean }> = {
  value: { label: "Value", example: "550,000" },
  replacementCost: { label: "Replacement cost", example: "800,000" },
  purchasePrice: { label: "Purchase price", example: "240,000" },
  closingCosts: { label: "Closing costs", example: "6,500" },
  rehabAmount: { label: "Rehab amount", example: "45,000" },
  rehabMonths: { label: "Rehab months", example: "6" },
  loanOriginalAmount: { label: "Original amount", example: "292,890" },
  currentLoan: { label: "Current loan", example: "292,890" },
  loanRate: { label: "Rate", example: "7.25" },
  loanPaymentMonthly: { label: "Payment / mo", example: "2,150" },
  insuranceCoverage: { label: "Coverage", example: "800,000" },
  insuranceDeductible: { label: "Deductible", example: "2,500" },
  insurancePremium: { label: "Premium", example: "3,200" },
  sqft: { label: "Sq ft", example: "2,300", whole: true },
};

/** One line naming the fields that didn't read as numbers, for the editor to show. */
export function badNumbersMessage(fields: string[]): string {
  const known = fields.map((f) => FIELDS[f] ?? { label: f, example: "550,000" });
  if (known.length === 1) {
    const [f] = known;
    return `${f.label} isn't ${f.whole ? "a whole number" : "a number"}. Enter it like ${f.example}.`;
  }
  const and = (xs: string[]) => `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
  return `${and(known.map((f) => f.label))} need numbers, like ${and(known.map((f) => f.example))}.`;
}
