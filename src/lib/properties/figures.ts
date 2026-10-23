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
    ltv: v > 0 ? `${((b / v) * 100).toFixed(1)}%` : null,
  };
}
