import type { TaskStatus } from "@prisma/client";
import { fmtDay, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { STATUS_ORDER } from "@/lib/task-scope";
import { targetDate, targetIsVisit } from "@/lib/tasks/rules";

/**
 * What a contractor is told at the top of their job page about changes HG
 * made since they last looked (docs/specs/activity-comments.md 3.4, question
 * 2 A): the job was sent back with a reason, its date moved, its notes were
 * updated. Updates keep no date history ("Date changes appear only as the
 * current Target, never as history", docs/asana-migration-plan.md §5.1); this
 * notice is the one place a change shows, so the page and the job email agree.
 *
 * Pure: queries.ts reads the events (portalEvents for the send back and its
 * note; the DUE, SCHEDULED, STATUS and NOTES events since the contractor's
 * last open) and hands them here. Nothing here sees a NOTES event's text or
 * its `data.from`: a partner may have taken text out of the notes on purpose.
 *
 * The date is the Target (rules.ts targetDate): the booked visit while the
 * job is Scheduled, otherwise the due date. It is compared before and after
 * each date edit with the status the job had at that moment, the rule core
 * uses for the TARGET email, so a contractor starting their own job (which
 * swaps the visit date for the due date) never reads as HG moving it. The
 * words are "Due date" and "Visit", never "target" (Connor, Oct 26).
 */

const isStatus = (v: unknown): v is TaskStatus => typeof v === "string" && (STATUS_ORDER as readonly string[]).includes(v);

/** A date edit or a status change on the job, oldest first; what the Target is worked out from. */
export interface DateEvent {
  kind: "DUE" | "SCHEDULED" | "STATUS";
  /** The value before and after: a day for the two dates, a status for STATUS. */
  from: string | null;
  to: string | null;
  /** A partner's first name when a partner made it; null for anyone else. */
  by: string | null;
}

/** The job as it is now. */
export interface JobDates {
  status: TaskStatus;
  due: Ymd | null;
  scheduled: Ymd | null;
}

export interface DateChange {
  kind: "moved" | "set" | "cleared";
  /** The date is the booked visit ("Visit"), not the due date. */
  visit: boolean;
  from: Ymd | null;
  to: Ymd | null;
  by: string | null;
}

const ymd = (v: string | null): Ymd | null => toYmd(v);

const targetOf = (s: JobDates): Ymd | null =>
  toYmd(targetDate({ status: s.status, dueDate: ymdToDate(s.due), scheduledFor: ymdToDate(s.scheduled) }));

const visitOf = (s: JobDates): boolean => targetIsVisit({ status: s.status, scheduledFor: ymdToDate(s.scheduled) });

/**
 * The change to the date the contractor sees, from the events since they last
 * opened the job (oldest first), or null when it ends where it started or never
 * moved. Several moves in a row read as one, from the first day to the last.
 */
export function dateChange(now: JobDates, events: readonly DateEvent[]): DateChange | null {
  // Back to how the job stood when they last looked, undoing the newest first.
  const s: JobDates = { ...now };
  for (const e of [...events].reverse()) {
    if (e.kind === "DUE") s.due = ymd(e.from);
    else if (e.kind === "SCHEDULED") s.scheduled = ymd(e.from);
    else if (isStatus(e.from)) s.status = e.from;
  }

  // The change so far; a holder, since a variable assigned in this loop would be read as the null it started as.
  const acc: { net: DateChange | null } = { net: null };
  for (const e of events) {
    if (e.kind === "STATUS") {
      if (isStatus(e.to)) s.status = e.to;
      continue;
    }
    const before = targetOf(s);
    const wasVisit = visitOf(s);
    if (e.kind === "DUE") s.due = ymd(e.to);
    else s.scheduled = ymd(e.to);
    const after = targetOf(s);
    if (before === after) continue;
    const visit = after ? visitOf(s) : wasVisit;
    const prev = acc.net;
    acc.net =
      prev && prev.visit === visit && prev.to === before
        ? { ...prev, to: after, by: e.by }
        : { kind: "moved", visit, from: before, to: after, by: e.by };
  }
  const net = acc.net;
  if (!net || net.from === net.to) return null;
  return { ...net, kind: net.from === null ? "set" : net.to === null ? "cleared" : "moved" };
}

/** "Due date moved to Fri, Oct 30 (was Thu, Oct 29)"; the person is a separate field, so a narrow screen can drop it. */
export function dateChangeText(c: DateChange, today: Ymd): string {
  const label = c.visit ? "Visit" : "Due date";
  const day = (d: Ymd | null) => fmtDay(d, { weekday: true, year: "auto", now: today });
  switch (c.kind) {
    case "moved":
      return `${label} moved to ${day(c.to)} (was ${day(c.from)})`;
    case "set":
      return `${label} set to ${day(c.to)}`;
    case "cleared":
      return `${label} cleared (was ${day(c.from)})`;
  }
}

/**
 * Whether a send back is still open for the contractor: the job is In
 * progress and the newest send back came after the last time they marked it
 * done. It stays until they mark the job done again.
 */
export function sendBackStands(status: TaskStatus, sentBackAt: Date | null, lastMarkedDoneAt: Date | null): boolean {
  if (status !== "IN_PROGRESS" || !sentBackAt) return false;
  return !lastMarkedDoneAt || sentBackAt.getTime() > lastMarkedDoneAt.getTime();
}

/** What the page shows at the top of the job; serializable. */
export interface JobNotice {
  sentBack: {
    /** The status change's event, and the note written with it when there is one: "See the update" opens the note. */
    statusEventId: string;
    noteEventId: string | null;
    by: string | null;
    /** ISO. */
    at: string;
    note: string | null;
  } | null;
  /** The sentence and, apart from it, who. */
  date: { text: string; by: string | null } | null;
  notes: { by: string | null } | null;
}

export const NO_NOTICE: JobNotice = { sentBack: null, date: null, notes: null };

export function hasNotice(n: JobNotice): boolean {
  return !!(n.sentBack || n.date || n.notes);
}

/** How many things the My jobs row counts for the notice: the date and the notes, a send back already being an update. */
export function noticeCount(date: DateChange | null, notes: boolean): number {
  return (date ? 1 : 0) + (notes ? 1 : 0);
}
