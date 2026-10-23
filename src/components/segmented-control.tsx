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
  // The deals filter bar: compact, beside h-8 fields.
  sm: "px-2.5 py-1 text-xs",
  // A page's main switch (Mine | Contractors): a 44px target on touch.
  md: "h-8 px-3 text-sm pointer-coarse:h-11",
};

/**
 * Pick one view or filter inside a page (CLAUDE.md, One switch per job).
 * The selected fill alone marks the pick; both states keep one weight. Each
 * segment is a pill toggle with `aria-pressed`, styled from that attribute.
 * Separate routes use `TopTabs` instead. `value` may be null when nothing
 * here is the current pick (another control is filtering).
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
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium text-muted transition-colors hover:text-foreground",
            "aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm",
            "outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            SIZES[size],
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
