"use client";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Tooltip } from "@/components/tooltip";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { activityTime, fmtDay, fullStamp, historyDay, todayYmdEastern, type Ymd } from "@/lib/dates";
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
 * An entry's time (docs/specs/activity-collapse.md 3.5): "now", "5m", "2h"
 * earlier today, then the day ("Yesterday", "Tue", "Oct 20"), since the
 * timeline has no day headings. A `<time dateTime>`. With a mouse it sits
 * inside the Tooltip, which gives the full stamp ("Thu, Oct 30 at 2:14 PM").
 * On touch it is plain text: a comment's menu header has the full stamp, and
 * a tap target per line would overlap its neighbors. A row known only by its
 * day (a line from the deals sheet) passes `day` and no `at`.
 */
export function ActivityTime({
  at,
  day,
  now,
  className,
}: {
  at?: Date | string | null;
  /** The day, for a row with no time of its own. Ignored when `at` is set. */
  day?: Ymd | null;
  /** The page's now, when no ActivityNow (or ActivityTimeline `now`) is above it. */
  now?: Date | string | number;
  className?: string;
}) {
  const current = useActivityNow(now);
  const coarse = useCoarsePointer();
  const ms = toMs(at);
  if (ms == null) {
    if (!day) return null;
    const today = todayYmdEastern(new Date(current));
    const label = (
      <time dateTime={day} className={cn("whitespace-nowrap", className)}>
        {historyDay(day, today)}
      </time>
    );
    return coarse ? label : <Tooltip label={fmtDay(day, { weekday: true, year: "auto", now: today })}>{label}</Tooltip>;
  }
  const time = (
    <time dateTime={new Date(ms).toISOString()} className={cn("whitespace-nowrap", className)}>
      {activityTime(ms, current)}
    </time>
  );
  if (coarse) return time;
  return <Tooltip label={fullStamp(ms, current)}>{time}</Tooltip>;
}

/** One end of a span: its instant, or only its day. */
export type ActivityWhen = { at?: Date | string | null; day?: Ymd | null };

/**
 * A collapsed line's time (activity-collapse 3.3): the first row's day to the
 * last's ("Nov 3 to Sun"), or the one time when they share a day. With a
 * mouse the Tooltip gives both full stamps. Ends with no day are skipped.
 */
export function ActivitySpan({ from, to, className }: { from: ActivityWhen; to: ActivityWhen; className?: string }) {
  const current = useActivityNow();
  const coarse = useCoarsePointer();
  const dayOf = (w: ActivityWhen): Ymd | null => {
    const ms = toMs(w.at);
    return ms != null ? todayYmdEastern(new Date(ms)) : (w.day ?? null);
  };
  const a = dayOf(from);
  const b = dayOf(to);
  if (!a || !b || a === b) {
    const one = b ? to : from;
    return <ActivityTime at={one.at} day={one.day} className={className} />;
  }
  const today = todayYmdEastern(new Date(current));
  const stamp = (w: ActivityWhen, d: Ymd) => (toMs(w.at) != null ? fullStamp(toMs(w.at)!, current) : fmtDay(d, { weekday: true, year: "auto", now: today }));
  const label = (
    <span className={cn("whitespace-nowrap", className)}>
      <time dateTime={a}>{historyDay(a, today)}</time> to <time dateTime={b}>{historyDay(b, today)}</time>
    </span>
  );
  return coarse ? label : <Tooltip label={`${stamp(from, a)} to ${stamp(to, b)}`}>{label}</Tooltip>;
}
