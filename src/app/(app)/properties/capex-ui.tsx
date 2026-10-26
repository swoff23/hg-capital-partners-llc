import { Badge } from "@/components/ui";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { cn, fmtMoney } from "@/lib/utils";
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
 * The forecast's spend by year (charts 2.5): the year, a 4px Meter scaled to
 * the biggest year, the amount, and on the property card the item count
 * (dropped below 400px). Each row prints its amount, so the bars need no
 * axis. A year with spend is a toggle (aria-pressed) named as a sentence
 * ("2026: $13,000 spend, 3 items"); picking it filters what's below, and it
 * keeps a 1px inset --line-control edge with its year in --fg-1. Nothing
 * dims: the other years stay at full strength. A year with nothing is plain
 * text with the dash, in order, and not a tab stop. Esc clears the pick
 * while focus is in the bars. The hover fill shows with a mouse only; rows
 * are 44px on touch.
 */
export function ForecastYearBars({
  years,
  selected,
  onSelect,
  onClear,
  showCount = false,
}: {
  years: ForecastYear[];
  selected: number | null;
  /** A year's row was pressed; the caller toggles the pick. */
  onSelect: (year: number) => void;
  /** Esc in the bars, with a year picked. */
  onClear: () => void;
  /** "3 items" after each total (the property forecast). */
  showCount?: boolean;
}) {
  const max = Math.max(1, ...years.map((y) => y.total));
  const row = "flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-meta pointer-coarse:min-h-11";
  const items = (n: number | undefined) => (n ? `${n} item${n === 1 ? "" : "s"}` : "");
  return (
    // Pulled out by the rows' padding, so the years and totals line up with the section's edges.
    <div
      className="-mx-2 space-y-0.5"
      onKeyDown={(e) => {
        // One Esc, one layer: with nothing picked it passes on.
        if (e.key === "Escape" && selected != null) {
          e.stopPropagation();
          onClear();
        }
      }}
    >
      {years.map((y) => {
        const active = selected === y.year;
        const content = (
          <>
            <span className={cn("num w-10 shrink-0", active ? "text-fg-1" : "text-fg-3")}>{y.year}</span>
            <Meter value={y.total} max={max} className="min-w-0 flex-1" />
            <span className="w-20 shrink-0 text-right text-fg-1">
              {y.total ? <Money value={y.total} /> : <span className="text-fg-3">—</span>}
            </span>
            {showCount && <span className="num w-14 shrink-0 text-right text-fg-3 max-[400px]:hidden">{items(y.count)}</span>}
          </>
        );
        if (!(y.total > 0 || (y.count ?? 0) > 0)) {
          return (
            <div key={y.year} className={row}>
              {content}
            </div>
          );
        }
        const name = [`${y.year}: ${fmtMoney(y.total)} spend`, showCount && items(y.count)].filter(Boolean).join(", ");
        return (
          <button
            key={y.year}
            type="button"
            onClick={() => onSelect(y.year)}
            aria-pressed={active}
            aria-label={name}
            className={cn(row, "transition-colors duration-fast hover:bg-fill-1", active && "ring-1 ring-inset ring-line-control")}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
