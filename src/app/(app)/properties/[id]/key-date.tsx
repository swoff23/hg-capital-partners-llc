import { cn } from "@/lib/utils";
import { fmtDay, isPastDay, relativeDays } from "@/lib/dates";
import { RailFact } from "./record-ui";

/**
 * A section's key date (loan maturity, insurance renewal), first in its
 * rail and shown even when it's missing: its reminder task only exists once
 * the date is set (JOURNEYS-006), so an empty one is a missing key fact, a
 * --warn verb that opens the section's editor ("Add maturity date"). A past
 * date reads late in --danger.
 */
export function KeyDate({
  label,
  date,
  addLabel,
  onAdd,
}: {
  label: string;
  date: string | null;
  /** The verb when it's missing: "Add maturity date". */
  addLabel: string;
  onAdd: () => void;
}) {
  const late = isPastDay(date);
  return (
    <RailFact label={label} empty={addLabel} onAdd={onAdd} tone="warn">
      {date && (
        <>
          <span className={cn("num", late && "text-danger")}>{fmtDay(date)}</span>
          <span className={cn("text-meta", late ? "text-danger" : "text-fg-3")}>{relativeDays(date)}</span>
        </>
      )}
    </RailFact>
  );
}
