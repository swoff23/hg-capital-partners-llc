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

/**
 * The first due date for a repeat that has none yet: the first day on or after
 * `today` the rule lands on. A pinned day of the month is this month's (clamped
 * to short months) unless it has passed, then next month's; any other rule
 * starts today.
 */
export function firstOccurrence(rule: RepeatRule, today: Ymd): Ymd {
  if (!rule.dayOfMonth) return today;
  const [y, m, d] = today.split("-").map(Number);
  const thisMonth = Math.min(rule.dayOfMonth, daysInMonth(y, m - 1));
  if (thisMonth >= d) return ymd(y, m - 1, thisMonth);
  return ymd(y, m, Math.min(rule.dayOfMonth, daysInMonth(y + Math.floor(m / 12), m % 12)));
}

/** A task's due date as written: the one given, or the first occurrence when it repeats and has none. */
export function repeatDue(rule: RepeatRule | null | undefined, due: Ymd | null | undefined, today: Ymd): Ymd | null {
  return due || (rule ? firstOccurrence(rule, today) : null);
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

// ---------------------------------------------------------------------------
// One copy per finish (core.ts createNextRepeat and setStatus)
// ---------------------------------------------------------------------------

/**
 * The copy a REPEAT_CREATED event points at, from its stored data. Null for
 * data that doesn't name one. `madeInAsana` marks Asana's own copy, which the
 * importer joined to the series (src/lib/asana/import.ts joinSeries).
 */
export function repeatCreatedCopy(data: unknown): { next: string; madeInAsana: boolean } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.next !== "string" || !d.next) return null;
  return { next: d.next, madeInAsana: d.madeInAsana === true };
}

/** What a repeat copy carries, read just before reopening the task whose finish made it. */
export interface RepeatCopyTrace {
  status: string;
  appEditedAt: Date | null;
  /** Set when the row mirrors an Asana task: deleting it here wouldn't delete it there. */
  asanaId: string | null;
  /** Every TaskEvent on the copy, deleted ones included. */
  eventKinds: readonly string[];
  /** TaskAttachment rows, deleted ones included. */
  attachments: number;
  checkedItems: number;
  readStates: number;
  /** Its NotificationOutbox rows. */
  emails: readonly { sentAt: Date | null; attempts: number }[];
}

/**
 * True when nobody has touched the copy since finishing its task made it, so
 * reopening that task can take it back and leave no trace: still To do, never
 * edited here, nothing on its timeline but its own CREATED line, no files, no
 * checked items, never opened in the portal, and no email that went out or
 * that a send run has already taken (it may be on its way).
 */
export function isUntouchedCopy(c: RepeatCopyTrace): boolean {
  return (
    c.status === "OPEN" &&
    c.appEditedAt === null &&
    c.asanaId === null &&
    c.eventKinds.length === 1 &&
    c.eventKinds[0] === "CREATED" &&
    c.attachments === 0 &&
    c.checkedItems === 0 &&
    c.readStates === 0 &&
    c.emails.every((e) => e.sentAt === null && e.attempts === 0)
  );
}
