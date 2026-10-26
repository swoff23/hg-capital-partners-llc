import type { ReactNode } from "react";
import { textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export type Fact = {
  label: ReactNode;
  /** The figure. null or undefined shows `empty`'s verb when there is one, else the dash. */
  value: ReactNode;
  /** The record's key figure: text-figure-l beside text-figure-m facts. */
  key?: boolean;
  /** One text-meta --fg-3 line under the figure, for its comparison ("Up $310") and nothing else. */
  sub?: ReactNode;
  /** A verb in place of the dash for a figure the user can fill ("Add value"), opening the editor where it lives. */
  empty?: { label: string; onClick: () => void };
  /** Changes when the figure does, so a new figure fades in over 120ms after a refresh. */
  fadeKey?: string | number;
};

/*
 * One size step for the whole strip (charts 2.2): a 28px figure steps to 20
 * when a cell would be under 136px, the room an eight-character figure
 * ("$398,400", "−$12,400") needs. Measured on the strip, so a pinned sidebar
 * counts: four cells from sm (32px of rules and padding each) step under
 * 42rem, the phone's two under 19rem.
 */
const FIGURE_L = "text-figure-l max-sm:@max-[19rem]:text-figure-m sm:@max-[42rem]:text-figure-m";

/**
 * Every row of headline figures (docs/specs/charts.md 2.2): the Financials
 * KPI strip, the property's Financials figures, the Portfolio strip and the
 * record's fact strip. Facts in one row split by --line rules and 16px in
 * from each rule; a 2 by 2 grid on phones, so no label wraps (brand
 * section 5, Density). From sm each fact's label, figure and line under it
 * join one grid, so the labels share a row, the subs share a row and the
 * rules run unbroken.
 *
 * `size="l"` sets every figure at text-figure-l (the KPI strip); the default
 * sets text-figure-m with an optional `key` fact at l, and then every figure
 * sits beside an invisible strut of the key's size, so a 20px figure shares
 * the 28px one's baseline. A strip whose longest figure runs past eight
 * characters ($1,240,000) passes "m" and stays at 20px everywhere.
 */
export function FactStrip({ facts, size = "m", className }: { facts: Fact[]; size?: "l" | "m"; className?: string }) {
  const hasKey = size === "m" && facts.some((f) => f.key);
  const hasSub = facts.some((f) => f.sub != null);
  return (
    <dl
      className={cn(
        "@container grid grid-cols-2 gap-y-4 py-1",
        "sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:gap-y-0",
        hasSub ? "sm:grid-rows-[auto_auto_auto]" : "sm:grid-rows-[auto_auto]",
        className,
      )}
    >
      {facts.map((f, i) => {
        // From sm every fact but the first sits right of a rule; on phones only the right-hand column does.
        const cell = cn("min-w-0 sm:pr-4", i > 0 && "sm:border-l sm:border-line sm:pl-4");
        const large = size === "l" || f.key;
        const empty = f.value == null;
        return (
          <div
            key={typeof f.label === "string" ? f.label : i}
            className={cn(
              "grid min-w-0 content-start gap-0.5 sm:contents",
              i % 2 === 1 && "max-sm:border-l max-sm:border-line max-sm:pl-4",
            )}
          >
            <dt className={cn(cell, "truncate text-meta text-fg-3 sm:pb-0.5")}>{f.label}</dt>
            <dd className={cn(cell, "flex items-baseline whitespace-nowrap text-fg-1")}>
              {hasKey && (
                // No overflow clip: a clipped box would lose its baseline. It's invisible, so its glyph never paints.
                <span aria-hidden="true" className={cn("invisible w-0", FIGURE_L)}>
                  0
                </span>
              )}
              {empty && f.empty ? (
                <button
                  type="button"
                  onClick={f.empty.onClick}
                  className={cn(textLinkClass, "text-body pointer-coarse:min-h-11")}
                >
                  {f.empty.label}
                </button>
              ) : (
                <span
                  key={f.fadeKey}
                  className={cn(large ? FIGURE_L : "text-figure-m", f.fadeKey != null && "animate-fade-in")}
                >
                  {empty ? <span className="text-fg-3">—</span> : f.value}
                </span>
              )}
            </dd>
            {hasSub && <dd className={cn(cell, "truncate text-meta text-fg-3 sm:pt-0.5")}>{f.sub}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
