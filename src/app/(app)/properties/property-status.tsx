import type { TaskStatus } from "@prisma/client";
import { StatusMark, type StageFill } from "@/components/status-badge";
import type { PROPERTY_STATUSES } from "@/lib/config";
import { cn } from "@/lib/utils";

type PropertyStatusName = (typeof PROPERTY_STATUSES)[number];

/*
 * The property lifecycle on the status ring (docs/brand-guidelines.md,
 * section 9), as deal stages do it (components/deal-stage.tsx): StatusMark's
 * stage variant fills the ring in lifecycle order, in --fg-2. Rehabbing is a
 * quarter, Refinancing half, Refinanced three-quarters and Stabilized full;
 * Sold is the check in --ok. Hold is the pause bars and Flip the clock hands,
 * since a flip is on a timetable.
 */
type Mark = { stage: StageFill } | { glyph: TaskStatus; tone: string };

const STATUS_MARK: Record<PropertyStatusName, Mark> = {
  Rehabbing: { stage: "quarter" },
  Refinancing: { stage: "half" },
  Refinanced: { stage: "three-quarter" },
  Stabilized: { stage: "full" },
  Hold: { glyph: "WAITING", tone: "text-fg-2" },
  Flip: { glyph: "SCHEDULED", tone: "text-fg-2" },
  Sold: { glyph: "DONE", tone: "text-ok" },
};

/** A status typed before the list existed: the empty ring. */
const UNKNOWN: Mark = { stage: "empty" };

const markOf = (status: string) => STATUS_MARK[status as PropertyStatusName] ?? UNKNOWN;

/**
 * A property's lifecycle status as its ring and its word, both in the stage's
 * tone. The word sets the baseline (the ring centers on it), so it sits in a
 * sentence like any word.
 */
export function PropertyStatus({ status, className }: { status: string; className?: string }) {
  const mark = markOf(status);
  const tone = "tone" in mark ? mark.tone : "text-fg-2";
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-1.5", tone, className)}>
      {"stage" in mark ? (
        <StatusMark stage={mark.stage} className="self-center" />
      ) : (
        <StatusMark status={mark.glyph} className={cn("self-center", tone)} />
      )}
      <span className="truncate">{status}</span>
    </span>
  );
}
