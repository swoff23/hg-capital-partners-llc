import type { Prisma, TaskStatus } from "@prisma/client";
import { HG_TIME_ZONE, type Ymd } from "@/lib/dates";
import { addDaysYmd } from "@/lib/quick-dates";

/**
 * The morning emails (docs/specs/emails-redesign.md, Q8): which one a job
 * gets, and when the hour is. Pure; see reminder-rules.test.ts. reminders.ts
 * queues them, and content.ts liveReminders checks each again as it sends.
 */

/** The hour in Buffalo the morning emails go out (Connor, Nov 22: 7 am, before crews leave). */
export const REMINDER_HOUR = 7;

/** The hour in Buffalo, 0 to 23. */
export function easternHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/**
 * True through the 7 o'clock hour in Buffalo. The cron runs every minute, so
 * a run that fails at 7:00 is made up by the next; past 8 a missed morning
 * stays missed rather than arriving late.
 */
export function inReminderHour(now: Date): boolean {
  return easternHour(now) === REMINDER_HOUR;
}

/**
 * The morning kinds (Q8). SCHEDULED_TODAY is Today, OVERDUE is Due yesterday: both keep the names rows were queued
 * under before Nov 22, since they mean what they did.
 *  - TELL_TENANT: Tell the tenant, two mornings before their day at a home that needs notice.
 *  - SCHEDULED_TODAY: Today, on their day.
 *  - STILL_OPEN: the morning after their day, never started.
 *  - NO_DAY: No day yet, once.
 *  - DUE_TODAY, OVERDUE: Due today and Due yesterday, only while no day is set.
 */
export type ReminderKind = "TELL_TENANT" | "SCHEDULED_TODAY" | "STILL_OPEN" | "NO_DAY" | "DUE_TODAY" | "OVERDUE";

/**
 * Kinds only rows queued before Nov 22 carry: the day-before heads-up and its Due twin. They send as what they
 * became (canonicalReminder), so a row waiting at deploy still reads sensibly.
 */
export type LegacyReminderKind = "SCHEDULED_TOMORROW" | "DUE_TOMORROW";

export const REMINDER_KINDS: readonly (ReminderKind | LegacyReminderKind)[] = [
  "TELL_TENANT",
  "SCHEDULED_TODAY",
  "STILL_OPEN",
  "NO_DAY",
  "DUE_TODAY",
  "OVERDUE",
  "SCHEDULED_TOMORROW",
  "DUE_TOMORROW",
];

export function isReminderKind(kind: string): kind is ReminderKind | LegacyReminderKind {
  return (REMINDER_KINDS as readonly string[]).includes(kind);
}

/** What an old row's kind is now: the day-before heads-up is Tell the tenant, Due tomorrow is No day yet. */
export function canonicalReminder(kind: ReminderKind | LegacyReminderKind): ReminderKind {
  if (kind === "SCHEDULED_TOMORROW") return "TELL_TENANT";
  if (kind === "DUE_TOMORROW") return "NO_DAY";
  return kind;
}

/**
 * Jobs still waiting on the contractor to plan or start: the morning emails go only for these. Not Waiting (on hold
 * gets nothing, Q8), and not In progress: in-progress work isn't nagged (Q8, Still open), and Due today and Due
 * yesterday go only while no day is set, with Schedule as the button.
 */
export const REMINDER_STATUSES: readonly TaskStatus[] = ["OPEN", "SCHEDULED"];

/** Tell the tenant goes this many mornings before their day (Q8: two, so 24 hours' notice fits even an early visit). */
export const TELL_TENANT_DAYS = 2;

/**
 * The one morning email a job gets today, and the day it's for, or null (Q8):
 *  - With a day (Scheduled): Today on it; Tell the tenant two mornings before it, at a home that needs notice
 *    (someone lives there and Permission to enter is off); Still open the morning after, while it was never
 *    started. Once a day is set, their day leads: no Due emails.
 *  - Without one (To do): Due today, Due yesterday, else No day yet, once: the second morning after New (`newOn`,
 *    the day the New email went), or the morning before Due if that comes first. Never the morning of a New sent
 *    that same day. The once is kept by core.ts queueDueReminder; this only says it's due.
 */
export function reminderFor(
  job: { status: TaskStatus; due: Ymd | null; scheduled: Ymd | null; needsNotice: boolean; newOn?: Ymd | null },
  today: Ymd,
): { kind: ReminderKind; day: Ymd } | null {
  if (!REMINDER_STATUSES.includes(job.status)) return null;
  const day = job.status === "SCHEDULED" ? job.scheduled : null;
  if (day) {
    if (day === today) return { kind: "SCHEDULED_TODAY", day };
    if (job.needsNotice && day === addDaysYmd(today, TELL_TENANT_DAYS)) return { kind: "TELL_TENANT", day };
    if (day === addDaysYmd(today, -1)) return { kind: "STILL_OPEN", day };
    return null;
  }
  if (job.due === today) return { kind: "DUE_TODAY", day: job.due };
  if (job.due && job.due === addDaysYmd(today, -1)) return { kind: "OVERDUE", day: job.due };
  const newOn = job.newOn ?? null;
  if (newOn && newOn >= today) return null;
  if ((newOn && newOn === addDaysYmd(today, -2)) || (job.due && job.due === addDaysYmd(today, 1))) return { kind: "NO_DAY", day: today };
  return null;
}

/**
 * Whether a morning line queued earlier is still true as it sends (content.ts liveReminders): the job is where the
 * line found it and the day it named still holds. `scheduled` is their day while Scheduled, `planned` the day column
 * whatever the status (an In progress job keeps it). Today alone also goes on a job they started this morning, with
 * Send for review as its button (section 4).
 */
export function reminderStillTrue(
  line: { kind: ReminderKind | LegacyReminderKind; due?: string },
  job: { status: TaskStatus; due: Ymd | null; scheduled: Ymd | null; planned?: Ymd | null; needsNotice: boolean },
  today: Ymd,
): boolean {
  const day = line.due ?? null;
  const kind = line.kind;
  switch (kind) {
    case "TELL_TENANT":
    case "SCHEDULED_TOMORROW":
      return job.status === "SCHEDULED" && !!day && job.scheduled === day && job.needsNotice && day >= today;
    case "SCHEDULED_TODAY":
      return day === today && ((job.status === "SCHEDULED" && job.scheduled === day) || (job.status === "IN_PROGRESS" && job.planned === day));
    case "STILL_OPEN":
      return job.status === "SCHEDULED" && !!day && job.scheduled === day && day < today;
    case "NO_DAY":
      return job.status === "OPEN";
    case "DUE_TOMORROW":
      return job.status === "OPEN" && !!day && job.due === day && day >= today;
    case "DUE_TODAY":
      return job.status === "OPEN" && day === today && job.due === day;
    case "OVERDUE":
      return job.status === "OPEN" && day === addDaysYmd(today, -1) && job.due === day;
  }
}

/**
 * Whether a day set now lands inside Tell the tenant's window, from two mornings before it through the day itself
 * (Q8: "A day set inside that window sends it at once").
 */
export function inTellWindow(day: Ymd, today: Ymd): boolean {
  const last = addDaysYmd(today, TELL_TENANT_DAYS);
  return !!last && day >= today && day <= last;
}

/**
 * The outbox rows that told a contractor they have a job (a New email that went, with no error), since `since`: for No
 * day yet's second morning (reminders.ts). A Prisma JSON filter, so the outbox's raw SQL stays in core.ts and the send
 * run (portal/upload-guards.test.ts).
 */
export function newEmailRowsWhere(since: Date): Prisma.NotificationOutboxWhereInput {
  return {
    recipientContactId: { not: null },
    taskId: { not: null },
    sentAt: { not: null },
    lastError: null,
    firstAt: { gte: since },
    items: { array_contains: [{ kind: "ASSIGNED" }] },
  };
}
