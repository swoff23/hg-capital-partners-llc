import "server-only";
import { prisma } from "@/lib/db";
import { toYmd, todayYmdEastern, ymdToDate } from "@/lib/dates";
import { logError } from "@/lib/log";
import { addDaysYmd } from "@/lib/quick-dates";
import type { TaskStatus } from "@prisma/client";
import { readJobAccess } from "@/lib/portal/access-code";
import { queueDueReminder, type Tx } from "@/lib/tasks/core";
import { dueReminderWhere } from "@/lib/tasks/list-query";
import { scheduledDay } from "@/lib/tasks/rules";
import { easternDayStart } from "./content";
import { inReminderHour, isSoon, reminderFor } from "./reminder-rules";

/**
 * The 8 am emails (docs/specs/contractor-job-emails.md, section 6, and
 * docs/specs/contractor-scheduled-date.md, Q5 and Q6): each minute of the 8
 * o'clock hour in Buffalo, every open job with a contractor gets at most one
 * line, the one reminder-rules.ts reminderFor picks: Scheduled today on their
 * day; at a home that needs 24 hours' notice, Scheduled tomorrow the day
 * before it (or Due tomorrow before a day is picked); Due today and Due
 * yesterday by Due. Open means waiting on them: To do, Scheduled, Waiting or
 * In progress. core.ts queueDueReminder keeps each to once per kind and day
 * and applies the email rules; the outbox sends them as it sends everything
 * (outbox.ts drainDue). Run by /api/cron/notifications. Never throws: a
 * failed job is logged and the rest go on.
 */
export async function queueDueReminders(now = new Date()): Promise<{ queued: number }> {
  if (!inReminderHour(now)) return { queued: 0 };
  const today = todayYmdEastern(now);
  const morning = easternDayStart(now);
  const days = [addDaysYmd(today, -1), today, addDaysYmd(today, 1)].map(ymdToDate).filter((d): d is Date => !!d);
  const tasks = await prisma.task
    .findMany({
      // Never a draft (tasks/list-query.ts dueReminderWhere).
      where: dueReminderWhere(days),
      select: { id: true, status: true, dueDate: true, scheduledFor: true, assigneeContactId: true, propertyId: true, unitLabel: true, entryPermittedAt: true },
      orderBy: { id: "asc" },
    })
    .catch((err: unknown) => {
      // The send run behind this must still go.
      logError("notifications:reminders", err);
      return [];
    });
  let queued = 0;
  for (const t of tasks) {
    if (!t.assigneeContactId) continue;
    try {
      const job = { status: t.status, due: toYmd(t.dueDate), scheduled: toYmd(scheduledDay(t)), needsNotice: false };
      // Who lives there is read only when a heads-up could be due: their day or Due tomorrow.
      const tomorrow = addDaysYmd(today, 1);
      if (job.scheduled === tomorrow || job.due === tomorrow) job.needsNotice = (await readJobAccess(prisma, t, now)).needsNotice;
      const pick = reminderFor(job, today);
      if (!pick) continue;
      const contactId = t.assigneeContactId;
      // One line per job per morning (spec section 4): a job that changed since this hour's first line gets no second.
      if (await prisma.$transaction((tx) => queueDueReminder(tx, { id: t.id, assigneeContactId: contactId }, pick.kind, pick.day, now, morning))) queued++;
    } catch (err) {
      logError("notifications:reminder", err, { taskId: t.id });
    }
  }
  return { queued };
}

/**
 * A contractor picked today or tomorrow at a home that needs 24 hours' notice
 * (docs/specs/contractor-scheduled-date.md, Q7): the heads-up goes now rather
 * than at the next 8 am, which would be too late. Queued in the pick's own
 * transaction, as the 8 am run would queue it, so neither sends it twice.
 */
export async function queueNoticeNow(
  tx: Tx,
  task: { id: string; status: TaskStatus; dueDate: Date | null; scheduledFor: Date | null; assigneeContactId: string | null; propertyId: string | null; unitLabel: string | null; entryPermittedAt: Date | null },
  now = new Date(),
): Promise<void> {
  const scheduled = toYmd(scheduledDay(task));
  const today = todayYmdEastern(now);
  if (!task.assigneeContactId || !scheduled || !isSoon(scheduled, today)) return;
  const access = await readJobAccess(tx, task, now);
  if (!access.needsNotice) return;
  const pick = reminderFor({ status: task.status, due: toYmd(task.dueDate), scheduled, needsNotice: true }, today);
  if (pick && pick.kind.startsWith("SCHEDULED")) await queueDueReminder(tx, { id: task.id, assigneeContactId: task.assigneeContactId }, pick.kind, pick.day, now);
}
