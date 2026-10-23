import { z } from "zod";
import { toYmd, type Ymd } from "@/lib/dates";

/**
 * Repeating tasks (docs/asana-migration-plan.md D27): when a task with a
 * repeat rule is done, the next copy is created, due on the next occurrence.
 * Pure; see repeat.test.ts.
 */

export const repeatRuleSchema = z.object({
  freq: z.enum(["days", "weeks", "monthly", "quarterly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  /** Monthly/quarterly/yearly only: pin to this day of the month (clamped to short months). */
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export type RepeatRule = z.infer<typeof repeatRuleSchema>;

/** A stored Task.repeatRule, or null when it's missing or malformed. */
export function parseRepeatRule(v: unknown): RepeatRule | null {
  const r = repeatRuleSchema.safeParse(v);
  return r.success ? r.data : null;
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

function ymd(y: number, m0: number, d: number): Ymd {
  return toYmd(new Date(Date.UTC(y, m0, d)))!;
}

/**
 * The next due date after `from` (the finished copy's due date, or the day it
 * was finished when it had none). Month steps keep the day of month and clamp
 * it: Jan 31 monthly is Feb 28, then Mar 31 when dayOfMonth is pinned to 31.
 */
export function nextOccurrence(rule: RepeatRule, from: Ymd): Ymd {
  const [y, m, d] = from.split("-").map(Number);
  const m0 = m - 1;
  switch (rule.freq) {
    case "days":
      return ymd(y, m0, d + rule.interval);
    case "weeks":
      return ymd(y, m0, d + 7 * rule.interval);
    default: {
      const months = rule.freq === "monthly" ? rule.interval : rule.freq === "quarterly" ? 3 * rule.interval : 12 * rule.interval;
      const total = m0 + months;
      const ny = y + Math.floor(total / 12);
      const nm0 = ((total % 12) + 12) % 12;
      const day = Math.min(rule.dayOfMonth ?? d, daysInMonth(ny, nm0));
      return ymd(ny, nm0, day);
    }
  }
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** "Every day", "Every 2 weeks", "Monthly on the 5th", "Quarterly", "Every 2 years". */
export function describeRepeat(rule: RepeatRule): string {
  const n = rule.interval;
  const on = rule.dayOfMonth ? ` on the ${ordinal(rule.dayOfMonth)}` : "";
  switch (rule.freq) {
    case "days":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "weeks":
      return n === 1 ? "Every week" : `Every ${n} weeks`;
    case "monthly":
      return (n === 1 ? "Monthly" : `Every ${n} months`) + on;
    case "quarterly":
      return (n === 1 ? "Quarterly" : `Every ${n} quarters`) + on;
    case "yearly":
      return n === 1 ? "Yearly" : `Every ${n} years`;
  }
}
