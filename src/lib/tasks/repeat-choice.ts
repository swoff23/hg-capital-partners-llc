import type { Ymd } from "@/lib/dates";
import { weekdayOf } from "@/lib/quick-dates";
import type { RepeatRule } from "./repeat";

/**
 * The Repeats editor's state and the stored rule, both ways (D27): Never,
 * every N days, every N weeks on the due date's weekday, monthly on day D,
 * quarterly, yearly. Pure; see repeat-choice.test.ts.
 */

export type RepeatMode = "never" | "days" | "weeks" | "monthly" | "quarterly" | "yearly";

export interface RepeatChoice {
  mode: RepeatMode;
  /** N for days and weeks. Kept from a stored rule for the other modes. */
  every: number;
  /** Day of the month: picked for monthly, the due date's for quarterly. Yearly keeps none. */
  day: number;
  /** Day of the week for weekly, 0 Sunday to 6 Saturday: the stored one, or the due date's. */
  weekday: number;
}

export const REPEAT_MODES: readonly { mode: RepeatMode; label: string }[] = [
  { mode: "never", label: "Never" },
  { mode: "days", label: "Every N days" },
  { mode: "weeks", label: "Every N weeks" },
  { mode: "monthly", label: "Monthly" },
  { mode: "quarterly", label: "Quarterly" },
  { mode: "yearly", label: "Yearly" },
];

const clamp = (n: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : fallback;

/**
 * The editor's starting state. `defaultDay` seeds "monthly on day D" and
 * `defaultWeekday` pins weekly (the due date's, or today's), unless the
 * stored rule already has its own.
 */
export function choiceFromRule(rule: RepeatRule | null, defaultDay: number, defaultWeekday: number): RepeatChoice {
  const day = clamp(defaultDay, 1, 31, 1);
  const weekday = clamp(defaultWeekday, 0, 6, 1);
  if (!rule) return { mode: "never", every: 1, day, weekday };
  return { mode: rule.freq, every: rule.interval, day: rule.dayOfMonth ?? day, weekday: rule.weekday ?? weekday };
}

/** The rule to store, or null for Never. Out-of-range numbers are pulled into range. */
export function ruleFromChoice(c: RepeatChoice): RepeatRule | null {
  const every = clamp(c.every, 1, 365, 1);
  switch (c.mode) {
    case "never":
      return null;
    case "days":
      return { freq: "days", interval: every };
    // Week steps pin the weekday, so moving one copy doesn't move the series.
    case "weeks":
      return { freq: "weeks", interval: every, weekday: clamp(c.weekday, 0, 6, 1) };
    // Month steps pin the day, so a 31st comes back after a short month instead of sliding to the 28th.
    case "monthly":
    case "quarterly":
      return { freq: c.mode, interval: every, dayOfMonth: clamp(c.day, 1, 31, 1) };
    // Not pinned: the chip has no day for yearly, so a pin would silently undo a moved renewal date.
    case "yearly":
      return { freq: "yearly", interval: every };
  }
}

/**
 * Switching the mode in the editor: back to the stored mode restores its
 * numbers; any other mode starts at every 1 on the due date's day and
 * weekday, not on ones left over from the mode just left.
 */
export function switchMode(initial: RepeatChoice, mode: RepeatMode, defaultDay: number, defaultWeekday: number): RepeatChoice {
  if (initial.mode === mode) return { ...initial };
  return { mode, every: 1, day: clamp(defaultDay, 1, 31, 1), weekday: clamp(defaultWeekday, 0, 6, 1) };
}

const dayOf = (v: Ymd) => Number(v.slice(8, 10));
const isYmd = (v: string | null | undefined): v is Ymd => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * New task: the due date is the first one, so a pinned day or weekday that
 * came from it moves with it (Due Oct 23, Monthly on the 23rd, then Due
 * Nov 15: Monthly on the 15th; Due Thursday, Every week on Thursday, then
 * Due Monday: Every week on Monday). A day picked apart from the due date
 * stays.
 */
export function followDueDay(rule: RepeatRule | null, prevDue: string | null | undefined, nextDue: string | null | undefined): RepeatRule | null {
  if (!rule || !isYmd(prevDue) || !isYmd(nextDue)) return rule;
  if (rule.dayOfMonth && rule.dayOfMonth === dayOf(prevDue)) return { ...rule, dayOfMonth: dayOf(nextDue) };
  if (rule.freq === "weeks" && rule.weekday !== undefined && rule.weekday === weekdayOf(prevDue)) return { ...rule, weekday: weekdayOf(nextDue) };
  return rule;
}
