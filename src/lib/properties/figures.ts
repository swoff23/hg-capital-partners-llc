import { parseAmount } from "@/lib/money";

/**
 * What a property's loan balance means against its value: equity (value less
 * balance) and loan-to-value (balance over value, one decimal). Each is null
 * when a figure it needs is missing. Takes the Decimal columns as the page
 * passes them, as text. Pure; see figures.test.ts.
 *
 * Equity is worked from the whole dollars the strip shows (`Money` rounds to
 * the dollar), so the three figures foot on screen: 15 Oxford's $428,000 less
 * $257,144 reads $170,856, where the cents ($257,143.50) used to round it to
 * $170,857.
 */
export function loanPosition(
  value: string | null,
  balance: string | null,
): { equity: number | null; ltv: string | null } {
  const v = parseAmount(value);
  const b = parseAmount(balance);
  if (v == null || b == null) return { equity: null, ltv: null };
  return {
    equity: footedEquity(v, b),
    ltv: v > 0 ? fmtLtv(b / v) : null,
  };
}

/** Value less balance in the whole dollars each is shown in, so the shown figures subtract exactly. */
export function footedEquity(value: number, balance: number): number {
  return Math.round(value) - Math.round(balance);
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
 * The Portfolio strip (charts D4): value, loan balance, equity and LTV over
 * the owned properties with a value on file, so the four always reconcile
 * (Value less Loan balance is Equity, Loan balance over Value is LTV) and a
 * missing value can't read as negative equity. An owned property with a
 * balance but no value is left out of all four and comes back in `leftOut`,
 * so the strip can say so; one with neither changes nothing. A sold property
 * counts nowhere.
 */
export function portfolioPosition<T extends PositionProperty>(
  props: readonly T[],
): {
  value: number;
  loan: number;
  equity: number | null;
  ltv: string | null;
  leftOut: T[];
} {
  const owned = props.filter((p) => !isSold(p.status));
  const valued = owned.filter((p) => p.value != null);
  const value = toCents(valued.reduce((s, p) => s + (p.value ?? 0), 0));
  const loan = toCents(valued.reduce((s, p) => s + (p.balance ?? 0), 0));
  return {
    value,
    loan,
    equity: valued.length > 0 ? footedEquity(value, loan) : null,
    ltv: value > 0 ? fmtLtv(loan / value) : null,
    leftOut: owned.filter((p) => p.value == null && (p.balance ?? 0) !== 0),
  };
}

/** One form of the left-out line: the words around the part that links to the property's Value (none for several). */
export type LeftOutWords = { before: string; link: string | null; after: string };

/**
 * The line under the Portfolio strip when a property is left out of it, or
 * null. For one, `wide` names it ("Leaves out 15 Oxford Ave, which has no
 * value.") and `phone` counts it ("Leaves out 1 property with no value."),
 * so a long street never cuts the reason off at 320; the caller links the
 * street or the count to its Value. For several, both count: "Leaves out 2
 * properties with no value."
 */
export function leftOutLine(names: readonly string[]): { wide: LeftOutWords; phone: LeftOutWords } | null {
  if (names.length === 0) return null;
  if (names.length === 1) {
    return {
      wide: { before: "Leaves out ", link: names[0], after: ", which has no value." },
      phone: { before: "Leaves out ", link: "1 property", after: " with no value." },
    };
  }
  const counted = { before: `Leaves out ${names.length} properties with no value.`, link: null, after: "" };
  return { wide: counted, phone: counted };
}
