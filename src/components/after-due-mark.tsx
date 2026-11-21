"use client";
import { TriangleAlert } from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import { fmtDay, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The warning after a scheduled day that lands after the due date
 * (docs/specs/contractor-scheduled-date.md, Q4): a `--warn` triangle placed
 * after the day, never before it, so a column of days still lines up. With a
 * mouse its Tooltip opens on hover; on touch a tap opens it ("After the due
 * date, Fri, Nov 20"). The same words are its accessible name.
 *
 * It sits over rows that open on a tap (task rows, the job page): the outer span
 * keeps a tap on the mark from opening the row, after the Tooltip has had it.
 * 16px, with a 44px touch area on coarse pointers. Decide whether to show it
 * with rules.ts isAfterDue (or list.ts scheduledAfterDue).
 */
export function AfterDueMark({
  due,
  today,
  className,
  inLink = false,
}: {
  due: Ymd;
  today: Ymd;
  className?: string;
  /**
   * Inside a row that is itself one link (My jobs): no button may sit in an `<a>`, so the mark is the icon with its
   * words for screen readers and a mouse's title; a tap opens the row, whose job page carries the full mark.
   */
  inLink?: boolean;
}) {
  const label = `After the due date, ${fmtDay(due, { weekday: true, year: "auto", now: today })}`;
  if (inLink) {
    return (
      <span title={label} className={cn("inline-flex shrink-0 text-warn", className)}>
        <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        <span className="sr-only">, {label.toLowerCase()}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("pointer-events-auto inline-flex shrink-0", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Tooltip label={label}>
        <button
          type="button"
          aria-label={label}
          className="relative inline-flex size-4 items-center justify-center rounded-sm text-warn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
        >
          <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      </Tooltip>
    </span>
  );
}
