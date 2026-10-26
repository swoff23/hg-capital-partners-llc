import { FactStrip } from "@/components/fact-strip";
import { Money } from "@/components/money";
import { portfolioPosition, type PositionProperty } from "@/lib/properties/figures";

/**
 * The Portfolio's summary strip (charts D4 A): Value, Loan balance, Equity
 * and LTV, the same four facts as a property's record strip. The table's
 * footer counts and sums the rest (units, open tasks, purchase), so the
 * strip carries leverage, which the footer can't. Sold properties count
 * nowhere; equity and LTV count only properties with a value on file, so a
 * missing value can't read as negative equity. Seven-figure values keep
 * every figure at 20px (charts 2.2).
 */
export function PortfolioStrip({ properties }: { properties: PositionProperty[] }) {
  const pos = portfolioPosition(properties);
  return (
    <FactStrip
      facts={[
        { label: "Value", value: <Money value={pos.value} /> },
        { label: "Loan balance", value: <Money value={pos.loan} /> },
        { label: "Equity", value: pos.equity == null ? null : <Money value={pos.equity} /> },
        { label: "LTV", value: pos.ltv && <span className="num">{pos.ltv}</span> },
      ]}
    />
  );
}
