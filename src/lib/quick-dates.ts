import { toYmd, type Ymd } from "./dates";

/**
 * The quick picks every date chip offers (docs/asana-migration-plan.md D7):
 * Today, Tomorrow, Friday, Next Monday, In 1 week, In 2 weeks, No date, each
 * with the weekday or date it resolves to. Calendar dates only, never shifted
 * by a timezone; pass "today" in as a "YYYY-MM-DD" (todayYmdEastern() on the
 * server). Pure; see quick-dates.test.ts.
 *
 * Each pick owns its number key, always: Today 1, Tomorrow 2, Friday 3, Next
 * Monday 4, In 1 week 5, In 2 weeks 6, No date 7 (docs/specs/selectors.md 2).
 * A pick that hides keeps its number unused, so 5 is always In 1 week and the
 * printed keys read 1, 2, 4, 5, 6, 7 when Friday hides.
 *
 * No two picks land on one day, so a pick hides when another already offers
 * its date:
 * - Friday is the first Friday after today. On a Thursday that's tomorrow and
 *   on a Friday it's a week out, so it hides both days. On a weekend it's the
 *   coming week's Friday.
 * - Next Monday is the first Monday after today. On a Monday that's a week
 *   out, so it hides. On a Sunday the first Monday is tomorrow, so it's the
 *   Monday after (8 days out).
 */

export type QuickPickKey = "today" | "tomorrow" | "friday" | "next-monday" | "week" | "two-weeks" | "none";

/** The number key that chooses each pick. */
export const QUICK_PICK_NUMBER: Record<QuickPickKey, number> = {
  today: 1,
  tomorrow: 2,
  friday: 3,
  "next-monday": 4,
  week: 5,
  "two-weeks": 6,
  none: 7,
};

export interface QuickPick {
  key: QuickPickKey;
  /** The key (1 to 7) that chooses it, fixed whichever other picks show. */
  number: number;
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

/** The Friday the "Friday" pick sets: the first Friday after today, a week out on a Friday. */
export function fridayPick(today: Ymd): Ymd {
  const ahead = ((5 - weekdayOf(today) + 6) % 7) + 1; // Sat +6, Sun +5, Mon +4 … Thu +1, Fri +7
  return addDaysYmd(today, ahead)!;
}

/** The Monday the "Next Monday" pick sets: see the module note for Mondays and Sundays. */
export function mondayPick(today: Ymd): Ymd {
  const dow = weekdayOf(today);
  const ahead = dow === 0 ? 8 : 8 - dow; // Sun +8, Mon +7, Tue +6 … Sat +2
  return addDaysYmd(today, ahead)!;
}

const fmt = (v: Ymd, opts: Intl.DateTimeFormatOptions) => utc(v).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const monthDay = (v: Ymd) => fmt(v, { month: "short", day: "numeric" });
const weekdayMonthDay = (v: Ymd) => fmt(v, { weekday: "short", month: "short", day: "numeric" });

/** The picks for `today`, in key order. Friday hides on a Thursday and a Friday, Next Monday on a Monday. */
export function quickPicks(today: Ymd): QuickPick[] {
  const t = toYmd(today);
  if (!t) throw new Error(`quickPicks: not a calendar date: ${today}`);
  const dow = weekdayOf(t);
  const tomorrow = addDaysYmd(t, 1)!;
  const friday = fridayPick(t);
  const monday = mondayPick(t);
  const week = addDaysYmd(t, 7)!;
  const twoWeeks = addDaysYmd(t, 14)!;
  const pick = (key: QuickPickKey, label: string, value: Ymd | null, hint: string): QuickPick => ({
    key,
    number: QUICK_PICK_NUMBER[key],
    label,
    value,
    hint,
  });
  return [
    pick("today", "Today", t, fmt(t, { weekday: "short" })),
    pick("tomorrow", "Tomorrow", tomorrow, fmt(tomorrow, { weekday: "short" })),
    // Thursday's Friday is Tomorrow; Friday's is In 1 week.
    dow !== 4 && dow !== 5 ? pick("friday", "Friday", friday, monthDay(friday)) : null,
    // A Monday's Monday is In 1 week.
    dow !== 1 ? pick("next-monday", "Next Monday", monday, monthDay(monday)) : null,
    pick("week", "In 1 week", week, weekdayMonthDay(week)),
    pick("two-weeks", "In 2 weeks", twoWeeks, weekdayMonthDay(twoWeeks)),
    pick("none", "No date", null, ""),
  ].filter((p): p is QuickPick => p !== null);
}

/** The pick a number key (1 to 9) chooses, or null when that number has no pick today. */
export function quickPickForKey(picks: QuickPick[], key: string): QuickPick | null {
  if (!/^[1-9]$/.test(key)) return null;
  return picks.find((p) => p.number === Number(key)) ?? null;
}
