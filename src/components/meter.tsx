import { cn } from "@/lib/utils";

/**
 * A measured share as a horizontal bar (docs/specs/charts.md 2.3): a 4px
 * --fill-1 track the width of its box with a --chart-1 fill from the left,
 * square ends. Status colors never fill it, so a full checklist stays
 * --chart-1. The same at every size, on touch and with a mouse.
 *
 * With `label` it's a progress bar ("Checklist", read with `valueText`,
 * "2 of 5 done"). Without one it's decoration beside a figure that already
 * says the value (a ranked expense, a year's spend), so it's hidden from
 * screen readers. `spring` animates the width over --dur-check, for a meter
 * that follows a tick; reduced motion makes it instant. `data-chart` keeps
 * the fill on paper (globals.css, print).
 */
export function Meter({
  value,
  max,
  label,
  valueText,
  spring = false,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  valueText?: string;
  spring?: boolean;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const a11y = label
    ? {
        role: "progressbar" as const,
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": max,
        "aria-valuenow": Math.max(0, Math.min(value, max)),
        "aria-valuetext": valueText,
      }
    : { "aria-hidden": true as const };
  return (
    <span data-chart="" className={cn("block h-1 w-full bg-fill-1", className)} {...a11y}>
      <span
        className={cn("block h-full bg-chart-1", spring && "transition-[width] duration-check ease-spring")}
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}
