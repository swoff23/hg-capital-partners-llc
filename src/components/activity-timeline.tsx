import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A vertical timeline: a hairline down the left, one dot per entry.
 * An ink dot (--act) marks something a person wrote (a note, a comment); a
 * --line-strong dot marks a change the app recorded. Used by the deal page and the
 * task page's Activity.
 *
 *   <ActivityTimeline className="max-h-[520px] overflow-y-auto">
 *     <ActivityItem marker="primary">…</ActivityItem>
 *     <ActivityItem>…</ActivityItem>
 *   </ActivityTimeline>
 *
 * Children are list items: ActivityItem, ActivityDay, or a plain <li>.
 */
export function ActivityTimeline({ className, children }: { className?: string; children: ReactNode }) {
  return <ol className={cn("relative space-y-2.5 border-l border-line pl-4", className)}>{children}</ol>;
}

export function ActivityItem({
  marker = "muted",
  markerClassName,
  className,
  children,
}: {
  /** "primary" for what a person wrote, "muted" for a recorded change, "none" for no dot. */
  marker?: "primary" | "muted" | "none";
  /** Moves the dot, e.g. to line up with a card's first line. */
  markerClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={cn("relative", className)}>
      {marker !== "none" && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -left-[21px] top-1.5 h-1.5 w-1.5 rounded-full",
            marker === "primary" ? "bg-act" : "bg-line-strong",
            markerClassName,
          )}
        />
      )}
      {children}
    </li>
  );
}

/** A day heading inside the timeline: "Today", "Mon, Oct 20". */
export function ActivityDay({
  children,
  className,
  markerClassName,
}: {
  children: ReactNode;
  className?: string;
  markerClassName?: string;
}) {
  return (
    <li className={cn("group relative pt-2 text-xs font-medium text-muted first:pt-0", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-[22px] top-3 h-2 w-2 rounded-full border border-line-strong bg-surface group-first:top-1",
          markerClassName,
        )}
      />
      {children}
    </li>
  );
}
