"use client";
import { useState, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { StatusMark } from "@/components/status-badge";
import { fieldClass } from "@/components/ui";
import { DEAL_STATUSES, type DealStatus } from "@/lib/config";
import { cn } from "@/lib/utils";

/*
 * Deal stages on the status ring (docs/brand-guidelines.md, section 9): the
 * ring fills by stage in --fg-2, Closed is the filled ring in --ok and Pass is
 * the slashed ring. StatusMark draws the task glyphs only, so each stage
 * borrows the nearest one and sets its own tone instead of drawing a second
 * copy of the ring. 3 - Low shares the empty ring with TBD (in --fg-2, not
 * --fg-3) until StatusMark has a quarter fill.
 */
const STAGE_MARK: Record<DealStatus, { glyph: TaskStatus; tone: string }> = {
  "1 - High": { glyph: "REVIEW", tone: "text-fg-2" }, // three-quarter ring
  "2 - Medium": { glyph: "IN_PROGRESS", tone: "text-fg-2" }, // half ring
  "3 - Low": { glyph: "OPEN", tone: "text-fg-2" }, // empty ring
  "4 - To Schedule": { glyph: "SCHEDULED", tone: "text-fg-2" }, // clock hands
  "5 - TBD": { glyph: "OPEN", tone: "text-fg-3" },
  "6 - Holding": { glyph: "WAITING", tone: "text-fg-3" }, // pause bars
  "CLOSED!": { glyph: "DONE", tone: "text-ok" },
  Pass: { glyph: "CANCELED", tone: "text-fg-3" },
};

/** A legacy stage no longer in DEAL_STATUSES (the column's old "Active" default). */
const UNKNOWN_STAGE = { glyph: "OPEN", tone: "text-fg-3" } as const;

/** A deal stage's ring: 14px with a mouse, 16px on touch, in the stage's tone. */
export function DealStageMark({ stage, className }: { stage: string; className?: string }) {
  const { glyph, tone } = STAGE_MARK[stage as DealStatus] ?? UNKNOWN_STAGE;
  return <StatusMark status={glyph} className={cn(tone, className)} />;
}

/* The ring sits where a leading icon would (32px of left padding); a list
   cell tightens the insets so the longest stage fits its column. */
const FIELD_SIZE = {
  cell: { field: "h-7 pl-7 pr-6", mark: "left-2", chevron: "right-1.5" },
  sm: { field: "h-8 pl-8 pr-7", mark: "left-2.5", chevron: "right-2.5" },
  md: { field: "h-9 pl-8 pr-7", mark: "left-2.5", chevron: "right-2.5" },
} as const;

/**
 * The deal stage picker: a native select on the field look (the
 * --line-control edge), with the stage's ring drawn over its left padding,
 * since an <option> can't hold an SVG (section 9, Fields). Controlled
 * through `value` or uncontrolled through `defaultValue`; the ring follows
 * either way. `fieldSize`: `cell` is 28px for a 40px list row, `sm` 32px
 * for a details row, `md` the 36px form field. All are 44px on touch, like
 * every field.
 */
export function StageSelect({
  value,
  defaultValue,
  onChange,
  fieldSize = "md",
  className,
  ...props
}: Omit<ComponentProps<"select">, "value" | "defaultValue" | "children" | "size"> & {
  value?: string;
  defaultValue?: string;
  fieldSize?: keyof typeof FIELD_SIZE;
}) {
  const size = FIELD_SIZE[fieldSize];
  const [own, setOwn] = useState(defaultValue ?? "");
  const shown = value ?? own;
  // A legacy stage no longer in the list still shows as picked.
  const stages: readonly string[] = (DEAL_STATUSES as readonly string[]).includes(shown)
    ? DEAL_STATUSES
    : [shown, ...DEAL_STATUSES];

  return (
    // A span, so the picker can sit inside a <label> (the New deal form).
    <span className={cn("relative block min-w-0", className)}>
      <DealStageMark
        stage={shown}
        className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2", size.mark)}
      />
      <select
        {...props}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(e) => {
          if (value === undefined) setOwn(e.target.value);
          onChange?.(e);
        }}
        className={cn(
          fieldClass,
          "appearance-none truncate disabled:opacity-50",
          size.field,
        )}
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 text-fg-3", size.chevron)}
      />
    </span>
  );
}
