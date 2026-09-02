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

/** For a Prisma Decimal column: "425000.00", or null. */
export function toDecimalString(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : n.toFixed(2);
}

/** parseAmount + toDecimalString — what the server actions write to Decimal columns. */
export function amountToDecimal(raw: unknown): string | null {
  return toDecimalString(parseAmount(raw));
}
