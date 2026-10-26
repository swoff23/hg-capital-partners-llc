"use client";
import { FactStrip } from "@/components/fact-strip";
import { Money } from "@/components/money";
import { openPropertyField } from "./edit-field-event";

/**
 * A property's fact strip (charts 4, the record): Value as the key figure,
 * then Loan balance, Equity and LTV, the same four facts as the Portfolio
 * strip. An empty Value is the "Add value" verb, which opens Details on that
 * field. Equity and LTV are this record's own value against its own balance.
 */
export function PropertyFactStrip({
  property,
  position,
  className,
}: {
  property: { value: number | null; balance: number | null };
  position: { equity: number | null; ltv: string | null };
  className?: string;
}) {
  return (
    <FactStrip
      className={className}
      facts={[
        {
          label: "Value",
          value: property.value == null ? null : <Money value={property.value} />,
          key: true,
          empty: { label: "Add value", onClick: () => openPropertyField("value") },
        },
        { label: "Loan balance", value: property.balance == null ? null : <Money value={property.balance} /> },
        { label: "Equity", value: position.equity == null ? null : <Money value={position.equity} /> },
        { label: "LTV", value: position.ltv && <span className="num">{position.ltv}</span> },
      ]}
    />
  );
}
