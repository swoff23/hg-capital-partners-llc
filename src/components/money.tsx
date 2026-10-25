import { moneyParts } from "@/lib/money";
import { cn, fmtMoney, toMoneyNumber } from "@/lib/utils";

/** A minus sign (U+2212), not a hyphen: it sits at the figures' height and width. */
const MINUS = "−";

/**
 * A dollar figure set like a statement (docs/brand-guidelines.md, section 3):
 * whole dollars by default ("$425,000"), tabular figures, a true minus for
 * money out, never mono.
 *
 *   <Money value={p.value} />              // $425,000
 *   <Money value={-1450.5} cents />        // −$1,450.50, the cents raised
 *   <Money value={2300} cents inflow />    // $2,300.00 in --ok, no plus
 *   <Money value={980} failed />           // struck through in --fg-3
 *
 * `value` is dollars (a number, a numeric string or a Prisma Decimal), as
 * fmtMoney takes it. Cents only on a single transaction line or a bill's key
 * figure; they ride at the cap line in the figure's own color (.cents in
 * globals.css). `inflow` is money in, on transaction lines only. A failed
 * amount sits beside a danger Badge reading "Failed", which the caller
 * places. An empty value is the dash glyph in --fg-3.
 */
export function Money({
  value,
  cents = false,
  inflow = false,
  failed = false,
  className,
}: {
  value: unknown;
  cents?: boolean;
  inflow?: boolean;
  failed?: boolean;
  className?: string;
}) {
  const n = toMoneyNumber(value);
  if (n === null) return <span className={cn("text-fg-3", className)}>—</span>;
  const parts = moneyParts(n, cents);

  return (
    <span
      className={cn(
        "num whitespace-nowrap",
        inflow && !failed && "text-ok",
        failed && "text-fg-3 line-through",
        className,
      )}
    >
      {parts.negative && MINUS}
      {fmtMoney(parts.dollars)}
      {cents && <span className="cents">.{String(parts.cents).padStart(2, "0")}</span>}
    </span>
  );
}
