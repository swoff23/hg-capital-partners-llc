import { parseAmount, toDecimalString } from "@/lib/money";

/**
 * Reading the numbers people type into the property editors. A blank field
 * clears the value; anything else must be one clean number. A typo used to be
 * stored as null, so "55o,000" quietly erased a $550,000 value. Now it's an
 * error that names the field, and nothing is written. A number too large for
 * its column (99999999999999999999 in Value) is refused the same way, with a
 * line that says the limit, where it used to fail in the database and come
 * back as "Something went wrong". Pure; see numbers.test.ts.
 */

/** `tooLarge`: a clean number past what the field's column holds. */
export type NumberRead<T> = { ok: true; value: T | null } | { ok: false; tooLarge?: true };

/**
 * What the money columns hold: Decimal(12,2) on Property is under $10
 * billion; Decimal(10,2) on a listing's rent is under $100 million;
 * Decimal(8,2) holds rehab months under a million.
 */
export const AMOUNT_LIMIT = 10_000_000_000;
export const RENT_LIMIT = 100_000_000;
const MONTHS_LIMIT = 1_000_000;

/** Square feet: an Int column, held well under its 2^31 to a sane 10 million. */
export const SQFT_LIMIT = 10_000_000;

/** Money and months: "550,000", "$550k". `limit` is the first amount the column can't hold. */
export function readAmount(raw: string | null | undefined, limit: number = AMOUNT_LIMIT): NumberRead<string> {
  const s = raw?.trim();
  if (!s) return { ok: true, value: null };
  const n = parseAmount(s);
  if (n == null) return { ok: false };
  // Rounded to the cent first, as the column stores it: 9,999,999,999.999 would round up to the limit.
  if (Math.abs(Math.round(n * 100) / 100) >= limit) return { ok: false, tooLarge: true };
  return { ok: true, value: toDecimalString(n) };
}

/** The limit for a money field by name: rehab months has its own column. */
export function amountLimit(field: string): number {
  return field === "rehabMonths" ? MONTHS_LIMIT : AMOUNT_LIMIT;
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

/** Whole, non-negative counts such as square feet: "2,300". Under `limit`. */
export function readWholeNumber(raw: string | null | undefined, limit: number = SQFT_LIMIT): NumberRead<number> {
  const s = raw?.trim().replace(/[,\s]/g, "");
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = parseInt(s, 10);
  return n >= limit ? { ok: false, tooLarge: true } : { ok: true, value: n };
}

/** A listing's rent that doesn't read, with a monthly example: the money kit's "like 425,000" reads as a price. */
export const RENT_MESSAGE = "Enter an amount, like 1,500.";

/** The line for a number past its field's limit, naming the limit: "Keep it under $10 billion." */
export function tooLargeMessage(field: string): string {
  if (field === "sqft") return "Keep it under 10,000,000.";
  if (field === "rehabMonths") return "Keep it under 1,000,000.";
  if (field === "rent") return "Keep it under $100 million.";
  return "Keep it under $10 billion.";
}

/**
 * Why a money field's text can't save, for the editor to say before it sends
 * (the server says the same): only the limit, since the field's own check
 * already refuses text that isn't a number. Null when it can save.
 */
export function amountProblem(field: string, raw: string): string | null {
  const r = field === "sqft" ? readWholeNumber(raw) : MONEY_FIELD_NAMES.has(field) ? readAmount(raw, amountLimit(field)) : null;
  return r && !r.ok && r.tooLarge ? tooLargeMessage(field) : null;
}

/** The fields `patchProperty` reads with `readAmount`. */
const MONEY_FIELD_NAMES = new Set([
  "value", "replacementCost", "purchasePrice", "closingCosts", "rehabAmount", "rehabMonths",
  "loanOriginalAmount", "currentLoan", "loanPaymentMonthly",
  "insuranceCoverage", "insuranceDeductible", "insurancePremium",
]);

const LABELS: Record<string, string> = {
  value: "Value",
  replacementCost: "Replacement cost",
  purchasePrice: "Purchase price",
  closingCosts: "Closing costs",
  rehabAmount: "Rehab amount",
  rehabMonths: "Rehab months",
  loanOriginalAmount: "Original amount",
  currentLoan: "Balance",
  loanRate: "Rate",
  loanPaymentMonthly: "Payment / mo",
  insuranceCoverage: "Coverage",
  insuranceDeductible: "Deductible",
  insurancePremium: "Premium",
  sqft: "Sq ft",
};

/**
 * One short line naming the fields that didn't read, for the editor to show.
 * Short enough to stay on one line in the narrow section cards. A field that
 * read as a number too large for it says the limit instead (`tooLarge`).
 */
export function badNumbersMessage(fields: string[], tooLarge: readonly string[] = []): string {
  if (fields.length === 1) {
    const [f] = fields;
    if (tooLarge.includes(f)) return tooLargeMessage(f);
    if (f === "loanRate") return "Rate needs a percentage, like 6.875.";
    if (f === "sqft") return "Sq ft isn't a whole number.";
    return `${LABELS[f] ?? f} isn't a number.`;
  }
  const labels = fields.map((f) => LABELS[f] ?? f);
  return `Check ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}.`;
}
