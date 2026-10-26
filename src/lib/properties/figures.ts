import { parseAmount } from "@/lib/money";

/**
 * What a property's loan balance means against its value: equity (value less
 * balance) and loan-to-value (balance over value, one decimal). Each is null
 * when a figure it needs is missing. Takes the Decimal columns as the page
 * passes them, as text. Pure; see figures.test.ts.
 */
export function loanPosition(
  value: string | null,
  balance: string | null,
): { equity: number | null; ltv: string | null } {
  const v = parseAmount(value);
  const b = parseAmount(balance);
  if (v == null || b == null) return { equity: null, ltv: null };
  return {
    equity: Math.round((v - b) * 100) / 100,
    ltv: v > 0 ? fmtLtv(b / v) : null,
  };
}

/** A loan-to-value ratio as a percent with one decimal: "62.6%". */
export function fmtLtv(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** The facts the Portfolio strip reads from a property, in dollars. */
export interface PositionProperty {
  status: string | null;
  value: number | null;
  /** The current loan balance on this record. */
  balance: number | null;
}

/** Dollars to the cent, so float sums like 430000 - 321603.45 don't carry noise. */
const toCents = (n: number) => Math.round(n * 100) / 100;

/** A sold property leaves every total, strip and count (charts D4). */
export function isSold(status: string | null | undefined): boolean {
  return status?.trim().toLowerCase() === "sold";
}

/**
 * The Portfolio strip (charts D4): the owned properties' value and loan
 * balance, then equity and LTV over the properties with a value on file, so
 * a missing value can't read as negative equity. A sold property counts
 * nowhere.
 */
export function portfolioPosition(props: readonly PositionProperty[]): {
  value: number;
  loan: number;
  equity: number | null;
  ltv: string | null;
} {
  const owned = props.filter((p) => !isSold(p.status));
  const valued = owned.filter((p) => p.value != null);
  const value = owned.reduce((s, p) => s + (p.value ?? 0), 0);
  const loan = owned.reduce((s, p) => s + (p.balance ?? 0), 0);
  const valuedValue = valued.reduce((s, p) => s + (p.value ?? 0), 0);
  const valuedLoan = valued.reduce((s, p) => s + (p.balance ?? 0), 0);
  return {
    value: toCents(value),
    loan: toCents(loan),
    equity: valued.length > 0 ? toCents(valuedValue - valuedLoan) : null,
    ltv: valuedValue > 0 ? fmtLtv(valuedLoan / valuedValue) : null,
  };
}
