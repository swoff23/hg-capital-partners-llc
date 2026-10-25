import { cn } from "@/lib/utils";
import { textLinkClass } from "@/components/ui";
import { fmtDay, isPastDay, relativeDays } from "@/lib/dates";

/**
 * A card's key date (loan maturity, insurance renewal), shown even when it's
 * missing: its reminder task only exists once the date is set, so an empty
 * one reads "Not set" with an Add that opens the card's editor (JOURNEYS-006).
 */
export function KeyDate({ label, date, onAdd }: { label: string; date: string | null; onAdd: () => void }) {
  return (
    <div className="mb-3 rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        {date ? (
          <>
            <span className="text-sm font-semibold">{fmtDay(date)}</span>
            <span
              className={cn(
                "text-xs",
                isPastDay(date) ? "font-medium text-red-600 dark:text-red-400" : "text-muted",
              )}
            >
              {relativeDays(date)}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Not set</span>
            <button type="button" onClick={onAdd} className={cn(textLinkClass, "text-xs font-medium")}>
              Add
            </button>
          </>
        )}
      </div>
    </div>
  );
}
