/**
 * The one parser for money and other decimal amounts typed by a person or
 * read from a spreadsheet cell: "$425,000", "425k", "1.2M", "7.25%", "usd 900".
 *
 * Returns null for anything that is not one clean number — "300s", ranges,
 * notes — so the caller keeps the raw text and stores no number. This used to
 * exist four times (deals, properties, the import scripts, QuickBooks) with
 * slightly different rules; QuickBooks keeps its own `toCents` because it
 * works in integer cents on machine-formatted report values, not human input.
 *
 * Pure; see money.test.ts.
 */

const CLEAN_NUMBER = /^-?\d+(\.\d+)?$/;

export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  let s = raw.trim().toLowerCase();
  if (s === "") return null;
  s = s.replace(/usd/g, "").replace(/[$,\s]/g, "").replace(/%$/, "");
  const mult = /k$/.test(s) ? 1_000 : /m$/.test(s) ? 1_000_000 : 1;
  s = s.replace(/[km]$/, "");
  if (!CLEAN_NUMBER.test(s)) return null;
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? n : null;
}

/** What a number field holds, which sets its keyboard, its slot and what it accepts (forms 2.3). */
export type NumberKind = "money" | "percent" | "integer" | "year" | "decimal";

/**
 * How a number reads once its field is left: "425000" becomes "425,000",
 * "6.875" stays, "2014" stays. Null leaves the text as typed: anything that
 * isn't one clean number ("low 400s"), and a fraction in an integer field,
 * which stays "1.5" so Save shows the form's own error line for it instead of
 * blur rounding it to 2 and saving something nobody typed.
 */
export function tidyAmount(kind: NumberKind, raw: string): string | null {
  const n = parseAmount(raw);
  if (n === null) return null;
  switch (kind) {
    case "money":
      return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    case "integer":
      return Number.isInteger(n) ? n.toLocaleString("en-US") : null;
    case "year":
      return String(Math.round(n));
    default:
      return String(n);
  }
}

/** The line under a number field that doesn't read, by kind (forms 2.3). Plain words, with an example. */
export const NUMBER_MESSAGE: Record<NumberKind, string> = {
  money: "Enter an amount, like 425,000.",
  percent: "Enter a rate, like 6.875.",
  integer: "Enter a whole number.",
  year: "Enter a year, like 2014.",
  decimal: "Enter a number, like 1.5.",
};

export type NumberRead = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * What a number field's text means for its kind (forms 2.3), the check the
 * browser runs before it sends and the server's readers agree with: blank is
 * "no value" (a blank clears), anything else must be one clean number in the
 * kind's range. Money, counts and decimals are zero or more; a rate is 0 to
 * 100; a year is 1900 to next year. Not one number gives the kind's own line.
 */
export function readNumber(kind: NumberKind, raw: string, now: Date = new Date()): NumberRead {
  if (raw.trim() === "") return { ok: true, value: null };
  const n = parseAmount(raw);
  const bad: NumberRead = { ok: false, message: NUMBER_MESSAGE[kind] };
  if (n === null || n < 0) return bad;
  switch (kind) {
    case "percent":
      return n <= 100 ? { ok: true, value: n } : bad;
    case "integer":
      return Number.isInteger(n) ? { ok: true, value: n } : bad;
    case "year":
      return Number.isInteger(n) && n >= 1900 && n <= now.getFullYear() + 1 ? { ok: true, value: n } : bad;
    default:
      return { ok: true, value: n };
  }
}

/**
 * How a number will save when that isn't what was typed, for the helper line
 * under a field while typing ("Saves as $425,000"). Null when the typed text
 * already reads that way, is blank, or doesn't read. With `allowText` (deal
 * prices), text that isn't one number is kept as typed: "Kept as text, no
 * amount". Only money previews: a rate or a count reads as typed.
 */
export function savesAs(kind: NumberKind, raw: string, opts: { allowText?: boolean } = {}): string | null {
  const text = raw.trim();
  if (text === "") return null;
  const n = parseAmount(text);
  if (n === null) return opts.allowText ? "Kept as text, no amount" : null;
  if (kind !== "money") return null;
  const shown = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  // "425,000" and "$425,000" already read as the amount; "425000" and "425k" don't.
  if (text.replace(/^\$\s*/, "") === shown) return null;
  return `Saves as $${shown}`;
}

/** For a Prisma Decimal column: "425000.00", or null. */
export function toDecimalString(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : n.toFixed(2);
}

/** parseAmount + toDecimalString — what the server actions write to Decimal columns. */
export function amountToDecimal(raw: unknown): string | null {
  return toDecimalString(parseAmount(raw));
}

/**
 * Share `index` of a non-negative `total` split evenly `parts` ways, in whole
 * steps of `step` (0.01 for money, 1 for counts and square feet). The first
 * shares take the remainder, so the shares always add back up to the total.
 */
export function evenShare(total: number, parts: number, index: number, step = 0.01): number {
  const scale = Math.round(1 / step);
  const whole = Math.round(total * scale);
  const share = Math.floor(whole / parts) + (index < whole % parts ? 1 : 0);
  return share / scale;
}

/**
 * How a dollar amount is shown (components/money.tsx): its sign, whole
 * dollars and, with `withCents`, the cents. Rounded once to what's shown, so
 * an amount that rounds to zero never carries a minus.
 */
export function moneyParts(n: number, withCents: boolean): { negative: boolean; dollars: number; cents: number } {
  const shown = withCents ? Math.round(Math.abs(n) * 100) : Math.round(Math.abs(n)) * 100;
  return { negative: n < 0 && shown > 0, dollars: Math.floor(shown / 100), cents: shown % 100 };
}
