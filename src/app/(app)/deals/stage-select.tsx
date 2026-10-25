"use client";
import { useState, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { StatusMark, type StageFill } from "@/components/status-badge";
import { fieldClass } from "@/components/ui";
import { DEAL_STATUSES, dealStatusLabel, type DealStatus } from "@/lib/config";
import { cn } from "@/lib/utils";

/*
 * Deal stages on the status ring (docs/brand-guidelines.md, section 9): the
 * ring fills by priority through StatusMark's stage variant, in --fg-2. High
 * is the full ring, Medium three-quarters, Low half, To Schedule a quarter
 * and TBD empty. Holding is the pause bars, Closed the check in --ok and Pass
 * the slash, as the task marks draw them.
 */
type Mark = { stage: StageFill } | { glyph: TaskStatus; tone: string };

const STAGE_MARK: Record<DealStatus, Mark> = {
  "1 - High": { stage: "full" },
  "2 - Medium": { stage: "three-quarter" },
  "3 - Low": { stage: "half" },
  "4 - To Schedule": { stage: "quarter" },
  "5 - TBD": { stage: "empty" },
  "6 - Holding": { glyph: "WAITING", tone: "text-fg-2" }, // pause bars
  "CLOSED!": { glyph: "DONE", tone: "text-ok" },
  Pass: { glyph: "CANCELED", tone: "text-fg-2" },
};

/** A legacy stage no longer in DEAL_STATUSES (the column's old "Active" default). */
const UNKNOWN_STAGE: Mark = { stage: "empty" };

const stageMark = (stage: string) => STAGE_MARK[stage as DealStatus] ?? UNKNOWN_STAGE;
const toneOf = (mark: Mark) => ("tone" in mark ? mark.tone : "text-fg-2");

/** A deal stage's ring: 14px with a mouse, 16px on touch, in the stage's tone. */
export function DealStageMark({ stage, className }: { stage: string; className?: string }) {
  const mark = stageMark(stage);
  return "stage" in mark ? (
    <StatusMark stage={mark.stage} className={className} />
  ) : (
    <StatusMark status={mark.glyph} className={cn(mark.tone, className)} />
  );
}

/** A deal's stage as its ring and its name, both in the stage's tone. The phone row's subline leads with it. */
export function DealStage({ stage, className }: { stage: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", toneOf(stageMark(stage)), className)}>
      <DealStageMark stage={stage} />
      <span className="truncate">{dealStatusLabel(stage)}</span>
    </span>
  );
}

/* The ring sits where a leading icon would (32px of left padding). A list
   cell tightens the insets so the longest stage fits its column, and puts
   the ring 9px into the field: with the cell's 3px inset (deal-row.tsx)
   that's 12px from the cell's edge, under the column's label. */
const FIELD_SIZE = {
  cell: { field: "h-7 pl-7.25 pr-6", mark: "left-2.25", chevron: "right-1.5" },
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
 * every field. Disabled, the whole picker dims, its ring and chevron too.
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
    <span className={cn("relative block min-w-0 transition-opacity has-disabled:opacity-50", className)}>
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
        className={cn(fieldClass, "appearance-none truncate", size.field)}
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            {dealStatusLabel(s)}
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
