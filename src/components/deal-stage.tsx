import type { TaskStatus } from "@prisma/client";
import { StatusMark, type StageFill } from "@/components/status-badge";
import { dealStatusLabel, type DealStatus } from "@/lib/config";
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
