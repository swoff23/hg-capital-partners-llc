"use client";
import Link from "next/link";
import { InlineField } from "@/components/inline-field";
import { Money } from "@/components/money";
import { RailFact, RailList } from "@/components/rail";
import { saveRehabAction } from "../actions";

/**
 * The Details rail (docs/specs/rehab-draws.md, L2): the lender and the holdback, which edit in place, and the properties as links.
 * The name and properties change from Edit rehab in the ⋯ menu. A rehab marked done shows the lender as text.
 */
export function RehabDetails({
  rehabId,
  name,
  lender,
  holdback,
  properties,
  done,
}: {
  rehabId: string;
  name: string;
  lender: string;
  /** The holdback as text, or "" when none is entered. */
  holdback: string;
  properties: { id: string; label: string }[];
  done: boolean;
}) {
  return (
    <RailList>
      <RailFact label="Lender">
        {done ? (
          lender || undefined
        ) : (
          <InlineField
            kind="text"
            label="Lender"
            field="lender"
            context={`Rehab · ${name}`}
            value={lender}
            empty="Add lender"
            onSave={(next) => saveRehabAction(rehabId, { lender: next || null })}
          />
        )}
      </RailFact>
      <RailFact label="Holdback">
        {done ? (
          holdback ? <Money value={Number(holdback)} /> : undefined
        ) : (
          <InlineField
            kind="money"
            label="Holdback"
            field="holdback"
            context={`Rehab · ${name}`}
            value={holdback}
            empty="Add holdback"
            onSave={(next) => saveRehabAction(rehabId, { holdback: next || null })}
          />
        )}
      </RailFact>
      <RailFact label="Properties">
        <ul className="min-w-0 py-1.5 pointer-coarse:py-0">
          {properties.map((p) => (
            <li key={p.id} className="min-w-0 py-0.5 pointer-coarse:py-0">
              {/* 44px tall on touch, so two properties stacked (765 and 767 Prospect) are each easy to tap. */}
              <Link
                href={`/properties/${p.id}`}
                className="flex min-w-0 items-center text-body text-foreground underline decoration-1 underline-offset-3 hover:decoration-2 pointer-coarse:min-h-11"
              >
                <span className="min-w-0 truncate">{p.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </RailFact>
    </RailList>
  );
}
