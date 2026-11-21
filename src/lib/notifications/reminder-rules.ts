import type { TaskStatus } from "@prisma/client";
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

/** The 8 am kinds (docs/specs/contractor-job-emails.md section 6, docs/specs/contractor-scheduled-date.md Q5 and Q6). */
export type ReminderKind = "SCHEDULED_TODAY" | "SCHEDULED_TOMORROW" | "DUE_TODAY" | "DUE_TOMORROW" | "OVERDUE";

/** Jobs still waiting on the contractor: the 8 am emails go only for these. */
export const REMINDER_STATUSES: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "WAITING", "IN_PROGRESS"];

/**
 * The one 8 am email a job gets this morning, and the day it's for, or null.
 * Their scheduled day's email wins over Due's when two land together
 * (docs/specs/contractor-scheduled-date.md, section 4): Scheduled today, then
 * Scheduled tomorrow, then Due today, then Due tomorrow, then Due yesterday.
 * The two "tomorrow" kinds are the 24-hour notice heads-up and go only at a
 * home that needs notice (someone lives there, Permission to enter off); Due
 * tomorrow only before a day is picked and before Start.
 */
export function reminderFor(
  job: { status: TaskStatus; due: Ymd | null; scheduled: Ymd | null; needsNotice: boolean },
  today: Ymd,
): { kind: ReminderKind; day: Ymd } | null {
  if (!REMINDER_STATUSES.includes(job.status)) return null;
  const tomorrow = addDaysYmd(today, 1);
  const scheduled = job.status === "SCHEDULED" ? job.scheduled : null;
  if (scheduled && scheduled === today) return { kind: "SCHEDULED_TODAY", day: scheduled };
  if (scheduled && job.needsNotice && scheduled === tomorrow) return { kind: "SCHEDULED_TOMORROW", day: scheduled };
  if (!job.due) return null;
  if (job.due === today) return { kind: "DUE_TODAY", day: job.due };
  if (job.needsNotice && !scheduled && (job.status === "OPEN" || job.status === "WAITING") && job.due === tomorrow) {
    return { kind: "DUE_TOMORROW", day: job.due };
  }
  if (job.due === addDaysYmd(today, -1)) return { kind: "OVERDUE", day: job.due };
  return null;
}

/** Whether `day` is today or tomorrow: a contractor's pick that soon at a notice home gets its heads-up at once (Q7). */
export function isSoon(day: Ymd, today: Ymd): boolean {
  return day === today || day === addDaysYmd(today, 1);
}
