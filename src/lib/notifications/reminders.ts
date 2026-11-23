import "server-only";
import { prisma } from "@/lib/db";
import { toYmd, todayYmdEastern, ymdToDate, type Ymd } from "@/lib/dates";
import { logError } from "@/lib/log";
import { addDaysYmd } from "@/lib/quick-dates";
import type { TaskStatus } from "@prisma/client";
import { readJobAccess } from "@/lib/portal/access-code";
import { listedTask } from "@/lib/task-scope";
import { queueDueReminder, queuePartnerPastDue, queueTellTenantNow, type Tx } from "@/lib/tasks/core";
import { dueReminderWhere } from "@/lib/tasks/list-query";
import { scheduledDay } from "@/lib/tasks/rules";
import { easternDayStart } from "./content";
import { TELL_TENANT_DAYS, inReminderHour, newEmailRowsWhere, pastDueToday, reminderFor } from "./reminder-rules";

/**
 * The morning emails (docs/specs/emails-redesign.md, Q8): each minute of the
 * 7 o'clock hour in Buffalo, every job a contractor still has to plan or
 * start gets at most one line, the one reminder-rules.ts reminderFor picks:
 * Past due the morning after the due date on any job not yet done (and the
 * partners get it too), Today on their day, Tell the tenant two mornings
 * before it at a home that needs notice, Not started the morning after a day
 * they never started, Due today, or Not yet scheduled once. Nothing for a job
 * on hold or in review (docs/specs/emails-redesign.md section 8). core.ts queueDueReminder keeps each to
 * once per kind and day (No day yet to once) and applies the email rules; the
 * outbox sends them as it sends everything (outbox.ts drainDue), checking each
 * line is still true. Run by /api/cron/notifications. Never throws: a failed
 * job is logged and the rest go on.
 */
export async function queueDueReminders(now = new Date()): Promise<{ queued: number }> {
  if (!inReminderHour(now)) return { queued: 0 };
  const today = todayYmdEastern(now);
  const morning = easternDayStart(now);
  const tellDay = addDaysYmd(today, TELL_TENANT_DAYS);
  const days = [addDaysYmd(today, -1), today, addDaysYmd(today, 1), tellDay].map((d) => (d ? ymdToDate(d) : null)).filter((d): d is Date => !!d);
  const select = { id: true, status: true, dueDate: true, scheduledFor: true, assigneeContactId: true, propertyId: true, unitLabel: true, entryPermittedAt: true } as const;
  const fail = (err: unknown) => {
    // The send run behind this must still go.
    logError("notifications:reminders", err);
    return [];
  };
  // When each contractor's New email about a job went, for No day yet (the second morning after it, never the same day).
  const newOn = await newEmailDays(morning).catch((err: unknown) => {
    logError("notifications:reminders", err);
    return new Map<string, Ymd>();
  });
  const dated = await prisma.task
    .findMany({
      // Never a draft (tasks/list-query.ts dueReminderWhere).
      where: dueReminderWhere(days),
      select,
      orderBy: { id: "asc" },
    })
    .catch(fail);
  // No day yet, the second morning after New, on a job whose dates are nowhere near: the jobs whose New went then.
  const seen = new Set(dated.map((t) => t.id));
  const twoAgo = addDaysYmd(today, -2);
  const sinceNew = [...newOn].filter(([key, day]) => day === twoAgo && !seen.has(key.split(":")[1])).map(([key]) => key.split(":")[1]);
  const fresh = sinceNew.length
    ? await prisma.task.findMany({ where: { ...listedTask, id: { in: sinceNew } }, select, orderBy: { id: "asc" } }).catch(fail)
    : [];
  let queued = 0;
  for (const t of [...dated, ...fresh]) {
    if (!t.assigneeContactId) continue;
    try {
      const job = {
        status: t.status,
        due: toYmd(t.dueDate),
        scheduled: toYmd(scheduledDay(t)),
        needsNotice: false,
        newOn: newOn.get(`${t.assigneeContactId}:${t.id}`) ?? null,
      };
      // Who lives there is read only when Tell the tenant could be due: their day two mornings out.
      if (job.scheduled && job.scheduled === tellDay) job.needsNotice = (await readJobAccess(prisma, t, now)).needsNotice;
      // Past due reaches the partners too, whether or not the contractor gets email (section 8).
      if (pastDueToday(job, today) && job.due) {
        const due = job.due;
        queued += await prisma.$transaction((tx) => queuePartnerPastDue(tx, t.id, due, now));
      }
      const pick = reminderFor(job, today);
      if (!pick) continue;
      const contactId = t.assigneeContactId;
      // One line per job per morning (Q8): a job that changed since this hour's first line gets no second.
      if (await prisma.$transaction((tx) => queueDueReminder(tx, { id: t.id, assigneeContactId: contactId }, pick.kind, pick.day, now, morning))) queued++;
    } catch (err) {
      logError("notifications:reminder", err, { taskId: t.id });
    }
  }
  return { queued };
}

/**
 * The Buffalo day each contractor's latest New email about a job went, by "<contactId>:<taskId>", over the last three
 * days: rows sent with no error whose lines hand them the job. A job whose New went earlier, or never by email, isn't
 * listed: No day yet then goes only the morning before Due.
 */
async function newEmailDays(morning: Date): Promise<Map<string, Ymd>> {
  const since = new Date(morning.getTime() - 3 * 24 * 3_600_000);
  const rows = await prisma.notificationOutbox.findMany({
    where: newEmailRowsWhere(since),
    select: { taskId: true, recipientContactId: true, firstAt: true },
    orderBy: { firstAt: "asc" },
  });
  // Oldest first, so each job keeps its latest.
  return new Map(rows.map((r) => [`${r.recipientContactId}:${r.taskId}`, todayYmdEastern(r.firstAt)]));
}

/**
 * A day set or moved inside Tell the tenant's window, from two mornings before it through the day, at a home that
 * needs 24 hours' notice (docs/specs/emails-redesign.md, Q8): Tell the tenant goes now rather than at a 7 am that has
 * passed. Queued in the pick's own transaction, as the 7 am run would queue it, so neither sends it twice. A
 * contractor's own pick comes here (portal/jobs.ts); a partner's is queued by core.ts itself.
 */
export async function queueNoticeNow(
  tx: Tx,
  task: { id: string; status: TaskStatus; dueDate: Date | null; scheduledFor: Date | null; assigneeContactId: string | null; propertyId: string | null; unitLabel: string | null; entryPermittedAt: Date | null },
  now = new Date(),
): Promise<void> {
  await queueTellTenantNow(tx, task, now);
}
