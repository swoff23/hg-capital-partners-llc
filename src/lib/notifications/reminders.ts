import "server-only";
import { prisma } from "@/lib/db";
import { toYmd, todayYmdEastern, ymdToDate } from "@/lib/dates";
import { logError } from "@/lib/log";
import { addDaysYmd } from "@/lib/quick-dates";
import { queueDueReminder } from "@/lib/tasks/core";
import { dueReminderWhere } from "@/lib/tasks/list-query";
import { targetDate } from "@/lib/tasks/rules";
import { inReminderHour, reminderFor } from "./reminder-rules";

/**
 * The 8 am emails (docs/specs/contractor-job-emails.md, section 6): each
 * minute of the 8 o'clock hour in Buffalo, every open job with a contractor
 * whose date is today gets "Due today", and one whose date was yesterday
 * gets "Due yesterday". Open means waiting on them: To do, Scheduled,
 * Waiting or In progress, never In review, Done or Canceled, and never a
 * draft (tasks/list-query.ts dueReminderWhere). The date is the
 * one the contractor sees (rules.ts targetDate). core.ts queueDueReminder
 * keeps each to once per date and applies the email rules; the outbox sends
 * them as it sends everything (outbox.ts drainDue). Run by
 * /api/cron/notifications. Never throws: a failed job is logged and the rest
 * go on.
 */
export async function queueDueReminders(
  now = new Date(),
): Promise<{ queued: number }> {
  if (!inReminderHour(now)) return { queued: 0 };
  const today = todayYmdEastern(now);
  const yesterday = addDaysYmd(today, -1);
  const days = [ymdToDate(today), ymdToDate(yesterday)].filter(
    (d): d is Date => !!d,
  );
  const tasks = await prisma.task
    .findMany({
      where: dueReminderWhere(days),
      select: {
        id: true,
        status: true,
        dueDate: true,
        scheduledFor: true,
        assigneeContactId: true,
      },
      orderBy: { id: "asc" },
    })
    .catch((err: unknown) => {
      // The send run behind this must still go.
      logError("notifications:reminders", err);
      return [];
    });
  let queued = 0;
  for (const t of tasks) {
    const kind = reminderFor(toYmd(targetDate(t)), today);
    const due = toYmd(targetDate(t));
    if (!kind || !due || !t.assigneeContactId) continue;
    try {
      const contactId = t.assigneeContactId;
      if (
        await prisma.$transaction((tx) =>
          queueDueReminder(
            tx,
            { id: t.id, assigneeContactId: contactId },
            kind,
            due,
            now,
          ),
        )
      )
        queued++;
    } catch (err) {
      logError("notifications:reminder", err, { taskId: t.id });
    }
  }
  return { queued };
}
