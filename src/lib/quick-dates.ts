import { toYmd, type Ymd } from "./dates";

/**
 * The quick picks every date chip offers (docs/asana-migration-plan.md D7):
 * Today, Tomorrow, Monday, Next week, No date, each with the weekday or date
 * it resolves to. Calendar dates only, never shifted by a timezone; pass
 * "today" in as a "YYYY-MM-DD" (todayYmdEastern() on the server). Pure; see
 * quick-dates.test.ts.
 *
 * Monday is the first Monday after today. On a Monday that's a week out,
 * never today. On a Sunday the first Monday is tomorrow, which Tomorrow
 * already offers, so it's the Monday after (8 days out): then it reads
 * "Next Monday" and sits after Next week, so the picks stay in date order.
 */

export type QuickPickKey = "today" | "tomorrow" | "monday" | "next-week" | "none";

export interface QuickPick {
  key: QuickPickKey;
  label: string;
  /** The date it sets, or null for No date. */
  value: Ymd | null;
  /** What it resolves to, shown on the right: "Thu", "Oct 26", "Thu, Oct 29". Empty for No date. */
  hint: string;
}

function utc(v: Ymd): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymdOf(d: Date): Ymd {
  return d.toISOString().slice(0, 10);
}

/** `v` moved by `n` calendar days. Null when `v` isn't a valid date. */
export function addDaysYmd(v: Ymd, n: number): Ymd | null {
  const y = toYmd(v);
  if (!y) return null;
  const d = utc(y);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
}

/** 0 for Sunday through 6 for Saturday. */
export function weekdayOf(v: Ymd): number {
  return utc(v).getUTCDay();
}

/** The Monday the "Monday" pick sets: see the module note for Mondays and Sundays. */
export function mondayPick(today: Ymd): Ymd {
  const dow = weekdayOf(today);
  const ahead = dow === 0 ? 8 : 8 - dow; // Sun +8, Mon +7, Tue +6 … Sat +2
  return addDaysYmd(today, ahead)!;
}

const fmt = (v: Ymd, opts: Intl.DateTimeFormatOptions) => utc(v).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** The five picks for `today`, in order. Keys 1 to 5 choose them. */
export function quickPicks(today: Ymd): QuickPick[] {
  const t = toYmd(today);
  if (!t) throw new Error(`quickPicks: not a calendar date: ${today}`);
  const tomorrow = addDaysYmd(t, 1)!;
  const monday = mondayPick(t);
  const nextWeek = addDaysYmd(t, 7)!;
  const sunday = weekdayOf(t) === 0;
  const mondayPickOf: QuickPick = {
    key: "monday",
    label: sunday ? "Next Monday" : "Monday",
    value: monday,
    hint: fmt(monday, { month: "short", day: "numeric" }),
  };
  const nextWeekPick: QuickPick = {
    key: "next-week",
    label: "Next week",
    value: nextWeek,
    hint: fmt(nextWeek, { weekday: "short", month: "short", day: "numeric" }),
  };
  return [
    { key: "today", label: "Today", value: t, hint: fmt(t, { weekday: "short" }) },
    { key: "tomorrow", label: "Tomorrow", value: tomorrow, hint: fmt(tomorrow, { weekday: "short" }) },
    // Date order: on a Sunday next week (Sun) comes before the Monday after it.
    ...(sunday ? [nextWeekPick, mondayPickOf] : [mondayPickOf, nextWeekPick]),
    { key: "none", label: "No date", value: null, hint: "" },
  ];
}

/** The pick a number key (1 to 5) chooses, or null for any other key. */
export function quickPickForKey(picks: QuickPick[], key: string): QuickPick | null {
  if (!/^[1-9]$/.test(key)) return null;
  return picks[Number(key) - 1] ?? null;
}
