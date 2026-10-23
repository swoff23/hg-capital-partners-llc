"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<K extends string> {
  key: K;
  label: ReactNode;
  /** Shown dimmed after the label. */
  count?: number;
}

const SIZES = {
  // The deals filter bar: compact, a 32px control beside h-8 fields with a
  // mouse, 44px on touch. Still 12px type: at text-label the deals filters
  // run past a 320px screen, so the type waits on that bar's layout.
  sm: "h-7 px-2.5 text-xs font-medium pointer-coarse:h-10",
  // A page's main switch (Mine | Contractors): a 36px control, a 44px target on touch.
  md: "h-8 px-3 text-label pointer-coarse:h-11",
};

/**
 * Pick one view or filter inside a page (CLAUDE.md, One switch per job).
 * A --fill-1 track with 2px around and between the segments; the selected
 * segment is --surface with a --line-control edge, so the pick never rests
 * on a pale fill alone (docs/brand-guidelines.md, section 9). Both states
 * keep one weight. Each segment is a pill toggle with `aria-pressed`, styled
 * from that attribute. Separate routes use `TopTabs` instead. `value` may be
 * null when nothing here is the current pick (another control is filtering).
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  size?: keyof typeof SIZES;
  className?: string;
  "aria-label": string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md bg-fill-1 p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-fg-2 transition-colors hover:text-fg-1",
            "aria-pressed:bg-surface aria-pressed:text-fg-1 aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-line-control",
            SIZES[size],
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 tabular-nums text-fg-3">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
