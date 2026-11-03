import { FactStrip } from "@/components/fact-strip";
import { Money } from "@/components/money";
import { TextLink } from "@/components/ui";
import { leftOutLine, portfolioPosition, type LeftOutWords, type PositionProperty } from "@/lib/properties/figures";

/** A property as the strip reads it: its figures, and its street and id for the line that names it when it's left out. */
export type StripProperty = PositionProperty & { id: string; name: string };

/**
 * The Portfolio's summary strip (charts D4 A): Value, Loan balance, Equity
 * and LTV, the same four facts as a property's record strip. The table's
 * footer counts and sums the rest (units, open tasks, purchase), so the
 * strip carries leverage, which the footer can't. Sold properties count
 * nowhere. All four count only properties with a value on file, so they
 * reconcile and a missing value can't read as negative equity; when that
 * leaves out a property with a loan, one line under the strip says which,
 * with a link to its Value. Seven-figure values keep every figure at 20px
 * (charts 2.2).
 */
export function PortfolioStrip({ properties }: { properties: StripProperty[] }) {
  const pos = portfolioPosition(properties);
  const line = leftOutLine(pos.leftOut.map((p) => p.name));
  const only = pos.leftOut.length === 1 ? pos.leftOut[0] : null;
  const words = (w: LeftOutWords) => (
    <>
      {w.before}
      {only && w.link && <TextLink href={`/properties/${only.id}#value`}>{w.link}</TextLink>}
      {w.after}
    </>
  );
  return (
    <>
      <FactStrip
        facts={[
          { label: "Value", value: <Money value={pos.value} /> },
          { label: "Loan balance", value: <Money value={pos.loan} /> },
          { label: "Equity", value: pos.equity == null ? null : <Money value={pos.equity} /> },
          { label: "LTV", value: pos.ltv && <span className="num">{pos.ltv}</span> },
        ]}
      />
      {line && (
        <p className="mt-2 truncate text-meta text-fg-3">
          {/* From sm it names the property; a phone counts it, so a long street can't cut the reason off. */}
          <span className="max-sm:hidden">{words(line.wide)}</span>
          <span className="sm:hidden">{words(line.phone)}</span>
        </p>
      )}
    </>
  );
}
