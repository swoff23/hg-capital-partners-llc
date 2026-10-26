import type { Ymd } from "@/lib/dates";
import { weekdayOf } from "@/lib/quick-dates";
import type { RepeatRule } from "./repeat";

/**
 * The repeat editor's state and the stored rule, both ways (D27): Never,
 * every N days, every N weeks on the due date's weekday, monthly on day D,
 * quarterly, yearly. The repeat menu's presets (repeat.ts repeatPresets) cover
 * the common rules; this is Custom's side, a count of days, weeks or months.
 * Pure; see repeat-choice.test.ts.
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

/** What Custom counts in: quarterly and yearly are presets, and a count of months covers them. */
export const CUSTOM_UNITS = [
  { mode: "days", label: "Days" },
  { mode: "weeks", label: "Weeks" },
  { mode: "monthly", label: "Months" },
] as const satisfies readonly { mode: RepeatMode; label: string }[];

export type CustomUnit = (typeof CUSTOM_UNITS)[number]["mode"];

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
 * came from it moves with it (Due Oct 23, Every month on the 23rd, then Due
 * Nov 15: Every month on the 15th; Due Thursday, Every week on Thursday, then
 * Due Monday: Every week on Monday). A day picked apart from the due date
 * stays.
 */
export function followDueDay(rule: RepeatRule | null, prevDue: string | null | undefined, nextDue: string | null | undefined): RepeatRule | null {
  if (!rule || !isYmd(prevDue) || !isYmd(nextDue)) return rule;
  if (rule.dayOfMonth && rule.dayOfMonth === dayOf(prevDue)) return { ...rule, dayOfMonth: dayOf(nextDue) };
  if (rule.freq === "weeks" && rule.weekday !== undefined && rule.weekday === weekdayOf(prevDue)) return { ...rule, weekday: weekdayOf(nextDue) };
  return rule;
}

const isCustomUnit = (m: RepeatMode): m is CustomUnit => m === "days" || m === "weeks" || m === "monthly";

/**
 * Custom's starting state. A stored rule opens as itself, with a quarterly or
 * yearly one counted in months (every quarter is every 3 months, every 2 years
 * every 24); no rule starts at every 2 weeks, the first thing a person
 * reaching for Custom usually wants.
 */
export function customFromRule(rule: RepeatRule | null, defaultDay: number, defaultWeekday: number): RepeatChoice {
  const base = choiceFromRule(rule, defaultDay, defaultWeekday);
  if (!rule) return { ...base, mode: "weeks", every: 2 };
  if (rule.freq === "quarterly") return { ...base, mode: "monthly", every: clamp(rule.interval * 3, 1, 365, 3) };
  if (rule.freq === "yearly") return { ...base, mode: "monthly", every: clamp(rule.interval * 12, 1, 365, 12), day: defaultDay };
  return base;
}

/**
 * Custom's unit changed: the count stays ("Every 2 weeks" to "Every 2
 * months"), and the new unit pins the due date's day or weekday, not one left
 * over from the unit just left.
 */
export function switchCustomUnit(choice: RepeatChoice, mode: CustomUnit, defaultDay: number, defaultWeekday: number): RepeatChoice {
  if (choice.mode === mode) return { ...choice };
  return { mode, every: choice.every, day: clamp(defaultDay, 1, 31, 1), weekday: clamp(defaultWeekday, 0, 6, 1) };
}

/**
 * The rule Custom's Save writes. When the person changed neither the count nor
 * the unit, the stored rule comes back as it was: Custom opens a quarterly rule
 * as "Every 3 months" and a yearly one as "Every 12 months", and writing that
 * would swap the rule (a yearly one gaining the day pin ruleFromChoice leaves
 * off) while nothing was edited. Callers compare the result with the stored
 * rule (ruleKey) before writing, so saving it unchanged writes nothing and
 * shows no toast. With no stored rule the opening suggestion, every 2 weeks, is
 * a choice to save. Any change starts from the due date's day and weekday
 * (switchCustomUnit).
 */
export function customRule(
  stored: RepeatRule | null,
  initial: RepeatChoice,
  unit: CustomUnit,
  every: number,
  defaultDay: number,
  defaultWeekday: number,
): RepeatRule | null {
  if (stored && unit === initial.mode && every === initial.every) return stored;
  return ruleFromChoice(switchCustomUnit({ ...initial, every }, unit, defaultDay, defaultWeekday));
}

const UNIT_WORD: Record<CustomUnit, string> = { days: "days", weeks: "weeks", monthly: "months" };

/**
 * The line under Custom's count when it can't be saved: an empty or
 * unreadable count asks for one ("Enter how many weeks.") instead of saving
 * NaN as "Every day" (BPLAY-030). Null when the count is a whole number from
 * 1 to 365, what the stored rule allows.
 */
export function customCountError(mode: RepeatMode, every: number): string | null {
  if (Number.isInteger(every) && every >= 1 && every <= 365) return null;
  const unit = isCustomUnit(mode) ? UNIT_WORD[mode] : "times";
  return Number.isFinite(every) && every > 365 ? `Use 365 ${unit} or fewer.` : `Enter how many ${unit}.`;
}
