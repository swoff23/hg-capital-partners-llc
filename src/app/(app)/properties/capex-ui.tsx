import { Badge } from "@/components/ui";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { EquipmentStatus } from "@/lib/property-types";

/* Shared by the CapEx pieces of Properties: the record's units, building
   systems and forecast, and the Portfolio forecast. */

/** "12 yrs", or the dash glyph for an unknown age. */
export const fmtAge = (n: number | null) => (n == null ? "—" : `${n} yr${n === 1 ? "" : "s"}`);

/**
 * An asset's lifecycle word. Replace is past its replacement age, so it's
 * late and takes the danger badge; Monitor is a partner's call to budget for
 * it (--warn); Good needs nothing and stays neutral, since green is for done
 * and money in (docs/brand-guidelines.md, section 2).
 */
export function EquipmentStatusText({ status }: { status: EquipmentStatus | null }) {
  if (status === "Replace") return <Badge tone="danger">Replace</Badge>;
  if (!status) return <span className="text-fg-3">—</span>;
  return (
    <span className={cn(status === "Monitor" ? "text-warn" : status === "Good" ? "text-fg-2" : "text-fg-3")}>
      {status}
    </span>
  );
}

/** A utility setup status's text color: Done is done (ok), Need to set up is late (danger), Call to confirm a decision (warn). */
export function utilityToneClass(tone: "green" | "amber" | "red" | "gray"): string {
  return { green: "text-ok", amber: "text-warn", red: "text-danger", gray: "text-fg-2" }[tone];
}

export type ForecastYear = { year: number; total: number; count?: number };

/**
 * The forecast's spend by year: one series in --chart-1, labelled directly,
 * each year a toggle (aria-pressed) that spotlights it below. The picked
 * year carries a --line-control edge, so the pick never rests on a fill.
 */
export function ForecastYearBars({
  years,
  selected,
  onSelect,
  showCount = false,
}: {
  years: ForecastYear[];
  selected: number | null;
  onSelect: (year: number) => void;
  /** "3 items" after each total (the property forecast). */
  showCount?: boolean;
}) {
  const max = Math.max(1, ...years.map((y) => y.total));
  return (
    // Pulled out by the rows' padding, so the years and totals line up with the section's edges.
    <div className="-mx-2 space-y-0.5">
      {years.map((y) => {
        const active = selected === y.year;
        const clickable = y.total > 0 || (y.count ?? 0) > 0;
        return (
          <button
            key={y.year}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect(y.year)}
            aria-pressed={active}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-meta transition-[opacity,background-color] duration-fast pointer-coarse:min-h-11",
              clickable ? "hover:bg-fill-1" : "cursor-default",
              active && "ring-1 ring-inset ring-line-control",
              !active && selected != null && "opacity-40",
            )}
          >
            <span className={cn("num w-10 shrink-0", active ? "text-fg-1" : "text-fg-3")}>{y.year}</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-fill-1">
              <span className="block h-full rounded-sm bg-chart-1" style={{ width: `${(y.total / max) * 100}%` }} />
            </span>
            <span className="w-20 shrink-0 text-right text-fg-1">
              {y.total ? <Money value={y.total} /> : <span className="text-fg-3">—</span>}
            </span>
            {showCount && (
              <span className="num w-14 shrink-0 text-right text-fg-3 max-[400px]:hidden">
                {y.count ? `${y.count} item${y.count === 1 ? "" : "s"}` : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A grand total row's cells (docs/brand-guidelines.md, section 3 Statement rules): a 1px --fg-1 rule above, a double rule below, 600. */
export const grandTotalCell = "border-t border-b-3 border-double border-fg-1 font-semibold";
