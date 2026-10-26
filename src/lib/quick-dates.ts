import { toYmd, type Ymd } from "./dates";

/**
 * The quick picks every date chip offers (docs/asana-migration-plan.md D7):
 * Today, Tomorrow, Monday, Next week, No date, each with the weekday or date
 * it resolves to. Calendar dates only, never shifted by a timezone; pass
 * "today" in as a "YYYY-MM-DD" (todayYmdEastern() on the server). Pure; see
 * quick-dates.test.ts.
 *
 * Each pick owns its number key, always: Today 1, Tomorrow 2, Monday 3, Next
 * week 4, No date 5 (docs/specs/selectors.md 2). A pick that hides keeps its
 * number unused, so 4 is always Next week and the printed keys read 1, 2, 4, 5
 * when Monday hides.
 *
 * Monday is the first Monday after today. On a Monday that's a week out,
 * which Next week already offers, so the Monday pick hides. On a Sunday the
 * first Monday is tomorrow, which Tomorrow already offers, so it's the Monday
 * after (8 days out) and reads "Next Monday".
 */

export type QuickPickKey = "today" | "tomorrow" | "monday" | "next-week" | "none";

/** The number key that chooses each pick. */
export const QUICK_PICK_NUMBER: Record<QuickPickKey, number> = {
  today: 1,
  tomorrow: 2,
  monday: 3,
  "next-week": 4,
  none: 5,
};

export interface QuickPick {
  key: QuickPickKey;
  /** The key (1 to 5) that chooses it, fixed whichever other picks show. */
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

/** The Monday the "Monday" pick sets: see the module note for Mondays and Sundays. */
export function mondayPick(today: Ymd): Ymd {
  const dow = weekdayOf(today);
  const ahead = dow === 0 ? 8 : 8 - dow; // Sun +8, Mon +7, Tue +6 … Sat +2
  return addDaysYmd(today, ahead)!;
}

const fmt = (v: Ymd, opts: Intl.DateTimeFormatOptions) => utc(v).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** The picks for `today`, in key order. Monday is left out on a Monday. */
export function quickPicks(today: Ymd): QuickPick[] {
  const t = toYmd(today);
  if (!t) throw new Error(`quickPicks: not a calendar date: ${today}`);
  const tomorrow = addDaysYmd(t, 1)!;
  const monday = mondayPick(t);
  const nextWeek = addDaysYmd(t, 7)!;
  const dow = weekdayOf(t);
  const picks: QuickPick[] = [
    { key: "today", number: QUICK_PICK_NUMBER.today, label: "Today", value: t, hint: fmt(t, { weekday: "short" }) },
    { key: "tomorrow", number: QUICK_PICK_NUMBER.tomorrow, label: "Tomorrow", value: tomorrow, hint: fmt(tomorrow, { weekday: "short" }) },
  ];
  // A Monday's Monday is Next week's day.
  if (dow !== 1) {
    picks.push({
      key: "monday",
      number: QUICK_PICK_NUMBER.monday,
      label: dow === 0 ? "Next Monday" : "Monday",
      value: monday,
      hint: fmt(monday, { month: "short", day: "numeric" }),
    });
  }
  picks.push(
    {
      key: "next-week",
      number: QUICK_PICK_NUMBER["next-week"],
      label: "Next week",
      value: nextWeek,
      hint: fmt(nextWeek, { weekday: "short", month: "short", day: "numeric" }),
    },
    { key: "none", number: QUICK_PICK_NUMBER.none, label: "No date", value: null, hint: "" },
  );
  return picks;
}

/** The pick a number key (1 to 9) chooses, or null when that number has no pick today. */
export function quickPickForKey(picks: QuickPick[], key: string): QuickPick | null {
  if (!/^[1-9]$/.test(key)) return null;
  return picks.find((p) => p.number === Number(key)) ?? null;
}
