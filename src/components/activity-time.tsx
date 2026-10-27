"use client";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Tooltip } from "@/components/tooltip";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { activityTime, fullStamp } from "@/lib/dates";
import { cn } from "@/lib/utils";

/*
 * The timeline's clock (docs/specs/activity-comments.md 2.4). One shared
 * 60-second ticker per page refreshes every time label, so "5m" never goes
 * stale. The server render and the first client render both read the page's
 * `now` (ActivityNow), so hydration matches; the ticker takes over right after.
 */

const MINUTE = 60_000;

/** The ticker's last reading; 0 while nothing on the page shows a time. */
let tick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function refresh() {
  tick = Date.now();
  listeners.forEach((l) => l());
}

/** Back from another tab: read the clock at once instead of at the next minute. */
function onVisible() {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick = Date.now();
    timer = setInterval(refresh, MINUTE);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      // The next page starts from its own `now`, not this one's last tick.
      tick = 0;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

function toMs(v: Date | string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const NowContext = createContext<number | null>(null);

/**
 * The page's `now` for every time under it: the instant the server rendered
 * the page, so the server and the first client render write the same labels.
 * ActivityTimeline sets it when given `now`.
 */
export function ActivityNow({ now, children }: { now: Date | string | number; children: ReactNode }) {
  return <NowContext value={toMs(now)}>{children}</NowContext>;
}

/**
 * Now, in ms: the page's `now` (the argument, or ActivityNow's) through the
 * server render and hydration, then the shared ticker's reading. Without
 * either it falls back to when the component first rendered.
 */
export function useActivityNow(now?: Date | string | number): number {
  const fromContext = useContext(NowContext);
  const [mounted] = useState(() => Date.now());
  const base = toMs(now) ?? fromContext ?? mounted;
  return useSyncExternalStore(
    subscribe,
    () => tick || base,
    () => base,
  );
}

/**
 * An entry's time (activity 2.4): "now", "5m", "2h" earlier today, "2:14 PM"
 * on an earlier day under its day heading, "Oct 3" under a month heading. A
 * `<time dateTime>`. With a mouse it sits inside the Tooltip, which gives the
 * full stamp ("Thu, Oct 30 at 2:14 PM"). On touch it is plain text: the
 * heading and the clock time already say when, a comment's menu header has
 * the full stamp, and a tap target per line would overlap its neighbors.
 */
export function ActivityTime({
  at,
  month = false,
  now,
  className,
}: {
  at: Date | string;
  /** Under a month heading: the day ("Oct 3") instead of the time. */
  month?: boolean;
  /** The page's now, when no ActivityNow (or ActivityTimeline `now`) is above it. */
  now?: Date | string | number;
  className?: string;
}) {
  const current = useActivityNow(now);
  const coarse = useCoarsePointer();
  const ms = toMs(at);
  if (ms == null) return null;
  const time = (
    <time dateTime={new Date(ms).toISOString()} className={cn("whitespace-nowrap", className)}>
      {activityTime(ms, current, { month })}
    </time>
  );
  if (coarse) return time;
  return <Tooltip label={fullStamp(ms, current)}>{time}</Tooltip>;
}
