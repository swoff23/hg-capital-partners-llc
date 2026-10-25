import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Fact = {
  label: string;
  value: ReactNode;
  /** The record's key figure: text-figure-l. The rest are text-figure-m. */
  key?: boolean;
};

/** The key figure's size: 28px, and 20 at 320, where a seven-figure value wouldn't fit half the row. */
const KEY_FIGURE = "text-figure-l max-[360px]:text-figure-m";

/**
 * Four facts in one row, split by --line rules and 16px in from each rule;
 * a 2 by 2 grid on phones, so no label wraps (docs/brand-guidelines.md,
 * section 5 Density). From sm each fact's label and figure join one grid,
 * so the labels share a row and the rules run unbroken. With a key figure,
 * every figure sits beside an invisible strut of the key figure's size, so
 * a 20px figure shares the 28px one's baseline.
 * The Portfolio summary strip and the property record's fact strip.
 */
export function FactStrip({ facts, className }: { facts: Fact[]; className?: string }) {
  const hasKey = facts.some((f) => f.key);
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-y-4 py-1",
        "sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:grid-rows-[auto_auto] sm:gap-y-0",
        className,
      )}
    >
      {facts.map((f, i) => {
        // From sm every fact but the first sits right of a rule; on phones only the right-hand column does.
        const cell = cn("min-w-0 sm:pr-4", i > 0 && "sm:border-l sm:border-line sm:pl-4");
        return (
          <div
            key={f.label}
            className={cn(
              "grid min-w-0 content-start gap-0.5 sm:contents",
              i % 2 === 1 && "max-sm:border-l max-sm:border-line max-sm:pl-4",
            )}
          >
            <dt className={cn(cell, "text-meta text-fg-3 sm:pb-0.5")}>{f.label}</dt>
            <dd className={cn(cell, "flex items-baseline whitespace-nowrap text-fg-1")}>
              {hasKey && (
                // No overflow clip: a clipped box would lose its baseline. It's invisible, so its glyph never paints.
                <span aria-hidden="true" className={cn("invisible w-0", KEY_FIGURE)}>
                  0
                </span>
              )}
              <span className={f.key ? KEY_FIGURE : "text-figure-m"}>{f.value}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
