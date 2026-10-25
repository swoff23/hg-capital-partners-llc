import type { ReactNode } from "react";
import type { TaskStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/task-scope";
import { cn } from "@/lib/utils";

/**
 * The one tone map for task statuses (docs/brand-guidelines.md, section 9).
 * No other file picks a status color. Color is state: Review is a partner's
 * decision (warn) and Done is done (ok); every other status is a neutral
 * gray, told apart by its glyph. Red belongs to the overdue date alone, and
 * avatars never take these tones.
 */
export const STATUS_TONE: Record<TaskStatus, string> = {
  OPEN: "text-fg-3",
  SCHEDULED: "text-fg-3",
  IN_PROGRESS: "text-fg-2",
  WAITING: "text-fg-3",
  REVIEW: "text-warn",
  DONE: "text-ok",
  CANCELED: "text-fg-3",
};

/* The ring family, drawn on lucide's 24 grid. Each starts from the same
   9-unit ring; the inner pie (r 5) fills by progress. */
const RING = <circle cx="12" cy="12" r="9" />;

const GLYPH: Record<TaskStatus, ReactNode> = {
  // Empty ring
  OPEN: RING,
  // Ring with clock hands
  SCHEDULED: (
    <>
      {RING}
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // Half ring: the right half of the pie
  IN_PROGRESS: (
    <>
      {RING}
      <path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" />
    </>
  ),
  // Ring with pause bars
  WAITING: (
    <>
      {RING}
      <path d="M10 9v6M14 9v6" />
    </>
  ),
  // Three-quarter ring
  REVIEW: (
    <>
      {RING}
      <path d="M12 12V7a5 5 0 1 1-5 5z" fill="currentColor" stroke="none" />
    </>
  ),
  // Filled ring with a check cut out in the surface color
  DONE: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path d="m8.5 12.25 2.5 2.5 4.5-5" className="stroke-surface" />
    </>
  ),
  // Slashed ring
  CANCELED: (
    <>
      {RING}
      <path d="M5.64 18.36 18.36 5.64" />
    </>
  ),
};

/** How far along a stage is: the ring's inner pie, empty to full. */
export type StageFill = "empty" | "quarter" | "half" | "three-quarter" | "full";

/* The stage variant: the same ring, its pie filled clockwise from 12 o'clock. */
const STAGE_GLYPH: Record<StageFill, ReactNode> = {
  empty: RING,
  quarter: (
    <>
      {RING}
      <path d="M12 12V7a5 5 0 0 1 5 5z" fill="currentColor" stroke="none" />
    </>
  ),
  half: GLYPH.IN_PROGRESS,
  "three-quarter": GLYPH.REVIEW,
  full: (
    <>
      {RING}
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
    </>
  ),
};

/**
 * A task status's glyph: 14px with a mouse, 16px on touch, in the status's
 * tone. The stroke is a fixed 1.5px at every size (non-scaling), so a ring
 * still reads in sunlight on a job site (docs/brand-guidelines.md, section 9).
 *
 * `stage` draws the stage variant instead, for a pipeline that fills by step
 * (deal priority, the property lifecycle): the ring with its pie empty, a
 * quarter, half, three-quarters or full, in --fg-2 unless `className` sets a
 * tone. A finished stage (Closed, Sold) is the `DONE` check in --ok and a
 * dropped one (Pass) the `CANCELED` slash, so those pass `status`.
 */
export function StatusMark(
  props: ({ status: TaskStatus; stage?: never } | { stage: StageFill; status?: never }) & { className?: string },
) {
  const { className } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        // vector-effect isn't inherited, so it goes on every shape.
        "size-3.5 shrink-0 pointer-coarse:size-4 [&_*]:[vector-effect:non-scaling-stroke]",
        props.stage ? "text-fg-2" : STATUS_TONE[props.status],
        className,
      )}
    >
      {props.stage ? STAGE_GLYPH[props.stage] : GLYPH[props.status]}
    </svg>
  );
}

/** A task's status: its mark and one word ("To do", "Review"), both in the status's tone. */
export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-meta", STATUS_TONE[status], className)}>
      <StatusMark status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
