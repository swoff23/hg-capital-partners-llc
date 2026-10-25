import type { TaskStatus } from "@prisma/client";
import { StatusMark } from "@/components/status-badge";
import type { PROPERTY_STATUSES } from "@/lib/config";
import { cn } from "@/lib/utils";

type PropertyStatusName = (typeof PROPERTY_STATUSES)[number];

/*
 * The property lifecycle on the status ring (docs/brand-guidelines.md,
 * section 9), as deal stages do it (deals/stage-select.tsx): the ring fills
 * by stage in --fg-2 and Sold is the filled ring in --ok. StatusMark draws
 * the task glyphs only, so each stage borrows the nearest one and sets its
 * own tone. Rehabbing is the half ring, Refinancing three-quarters, and a
 * finished refinance or a stabilized building the full ring; Hold is the
 * pause bars and Flip the clock hands, since a flip is on a timetable.
 */
const STATUS_MARK: Record<PropertyStatusName, { glyph: TaskStatus; tone: string }> = {
  Rehabbing: { glyph: "IN_PROGRESS", tone: "text-fg-2" },
  Refinancing: { glyph: "REVIEW", tone: "text-fg-2" },
  Refinanced: { glyph: "DONE", tone: "text-fg-2" },
  Stabilized: { glyph: "DONE", tone: "text-fg-2" },
  Hold: { glyph: "WAITING", tone: "text-fg-2" },
  Flip: { glyph: "SCHEDULED", tone: "text-fg-2" },
  Sold: { glyph: "DONE", tone: "text-ok" },
};

/** A status typed before the list existed: the empty ring. */
const UNKNOWN = { glyph: "OPEN", tone: "text-fg-2" } as const;

const markOf = (status: string) => STATUS_MARK[status as PropertyStatusName] ?? UNKNOWN;

/**
 * A property's lifecycle status as its ring and its word, both in the stage's
 * tone. The word sets the baseline (the ring centers on it), so it sits in a
 * sentence like any word.
 */
export function PropertyStatus({ status, className }: { status: string; className?: string }) {
  const { glyph, tone } = markOf(status);
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-1.5", tone, className)}>
      <StatusMark status={glyph} className={cn("self-center", tone)} />
      <span className="truncate">{status}</span>
    </span>
  );
}
