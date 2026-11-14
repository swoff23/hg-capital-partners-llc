import { HG_TIME_ZONE, type Ymd } from "@/lib/dates";
import { addDaysYmd } from "@/lib/quick-dates";

/**
 * The 8 am emails (docs/specs/contractor-job-emails.md, section 6, Connor's
 * times): which one a job gets, and when the hour is. Pure; see
 * reminder-rules.test.ts. reminders.ts queues them.
 */

/** The hour in Buffalo the reminders go out. */
export const REMINDER_HOUR = 8;

/** The hour in Buffalo, 0 to 23. */
export function easternHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/**
 * True through the 8 o'clock hour in Buffalo. The cron runs every minute, so
 * a run that fails at 8:00 is made up by the next; past 9 a missed morning
 * stays missed rather than arriving late.
 */
export function inReminderHour(now: Date): boolean {
  return easternHour(now) === REMINDER_HOUR;
}

/** Due today, due yesterday, or neither, for a job's date (the one the contractor sees) on Buffalo's today. */
export function reminderFor(target: Ymd | null, today: Ymd): "DUE_TODAY" | "OVERDUE" | null {
  if (!target) return null;
  if (target === today) return "DUE_TODAY";
  return target === addDaysYmd(today, -1) ? "OVERDUE" : null;
}
