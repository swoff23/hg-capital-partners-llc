import { z } from "zod";
import { toYmd, type Ymd } from "@/lib/dates";
import { weekdayOf } from "@/lib/quick-dates";

/**
 * Repeating tasks (docs/asana-migration-plan.md D27): when a task with a
 * repeat rule is done, the next copy is created, due on the next occurrence
 * that isn't already past. Pure; see repeat.test.ts.
 */

export const repeatRuleSchema = z.object({
  freq: z.enum(["days", "weeks", "monthly", "quarterly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  /** Monthly/quarterly/yearly only: pin to this day of the month (clamped to short months). */
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  /**
   * Weekly only: pin to this day of the week, 0 Sunday to 6 Saturday, so
   * moving one copy doesn't move the series. A weekly rule saved before the
   * pin existed has none and steps from the last copy's due date.
   */
  weekday: z.number().int().min(0).max(6).optional(),
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
 * The `k`th step after `from`, counted from `from` itself so a pinned day
 * holds however many steps there are. A pinned weekday is the one on or
 * before the step: Every week on Monday, from a copy pushed from Monday to
 * Friday, is the Monday after that Friday.
 */
function occurrence(rule: RepeatRule, from: Ymd, k: number): Ymd {
  const [y, m, d] = from.split("-").map(Number);
  const m0 = m - 1;
  switch (rule.freq) {
    case "days":
      return ymd(y, m0, d + k * rule.interval);
    case "weeks": {
      const step = d + 7 * k * rule.interval;
      if (rule.weekday === undefined) return ymd(y, m0, step);
      return ymd(y, m0, step - ((new Date(Date.UTC(y, m0, step)).getUTCDay() - rule.weekday + 7) % 7));
    }
    default: {
      const months = k * (rule.freq === "monthly" ? rule.interval : rule.freq === "quarterly" ? 3 * rule.interval : 12 * rule.interval);
      const total = m0 + months;
      const ny = y + Math.floor(total / 12);
      const nm0 = ((total % 12) + 12) % 12;
      const day = Math.min(rule.dayOfMonth ?? d, daysInMonth(ny, nm0));
      return ymd(ny, nm0, day);
    }
  }
}

/**
 * The next due date after `from` (repeatFrom). Month steps keep the day of
 * month and clamp it: Jan 31 monthly is Feb 28, then Mar 31 when dayOfMonth
 * is pinned to 31. Week steps land on a pinned weekday.
 */
export function nextOccurrence(rule: RepeatRule, from: Ymd): Ymd {
  return occurrence(rule, from, 1);
}

/**
 * The due date of the copy that finishing a repeat makes: the first step
 * after `from` that is on or after `today` (Buffalo's), so a repeat finished
 * late never makes a copy that's already overdue. The pinned day holds: a
 * monthly task due Jul 5 and finished Oct 23 makes Nov 5, not Aug 5.
 */
export function nextRepeatDue(rule: RepeatRule, from: Ymd, today: Ymd): Ymd {
  let k = 1;
  let next = occurrence(rule, from, k);
  while (next < today) next = occurrence(rule, from, ++k);
  return next;
}

/** A rule pinned to a weekday (weekly) or a day of the month (monthly, quarterly). */
export function hasPinnedDay(rule: RepeatRule): boolean {
  if (rule.freq === "weeks") return rule.weekday !== undefined;
  return (rule.freq === "monthly" || rule.freq === "quarterly") && !!rule.dayOfMonth;
}

/** Whether `day` falls on the rule's pinned day (a pinned 31st counts on a short month's last day). */
function onPinnedDay(rule: RepeatRule, day: Ymd): boolean {
  if (rule.freq === "weeks") return rule.weekday !== undefined && weekdayOf(day) === rule.weekday;
  if (!hasPinnedDay(rule)) return false;
  const [y, m, d] = day.split("-").map(Number);
  return d === Math.min(rule.dayOfMonth!, daysInMonth(y, m - 1));
}

/**
 * The date a finished copy's next one steps from. A rule pinned to a weekday
 * or a day of the month steps from `slot`, the date the series gave the copy
 * when it was made, not the date it was moved to, so moving one copy earlier
 * or later doesn't move the series (an Oct 30 copy moved to Nov 2 still makes
 * Nov 30). A slot off the pinned day (the rule was re-pinned since) doesn't
 * count. Otherwise it's the copy's due date, or today when it has none.
 */
export function repeatFrom(rule: RepeatRule, slot: Ymd | null, due: Ymd | null, today: Ymd): Ymd {
  if (slot && onPinnedDay(rule, slot)) return slot;
  return due ?? today;
}

/**
 * The due date finishing a task gives its next copy: the first step on or
 * after `today` from where the rule steps (repeatFrom). The repeat menu's
 * "Next:" line reads it, so the date it promises is the one createNextRepeat
 * (core.ts) writes, including for a copy moved off its pinned day. `slot` is
 * the date the series gave the task (repeat-slot.ts copySlot), null for a series' first task.
 */
export function nextCopyDue(rule: RepeatRule, slot: Ymd | null, due: Ymd | null, today: Ymd): Ymd {
  return nextRepeatDue(rule, repeatFrom(rule, slot, due, today), today);
}

/**
 * The first due date for a repeat that has none yet: the first day on or after
 * `today` the rule lands on. A pinned day of the month is this month's (clamped
 * to short months) unless it has passed, then next month's; a pinned weekday
 * is the next one, today included; any other rule starts today.
 */
export function firstOccurrence(rule: RepeatRule, today: Ymd): Ymd {
  if (rule.freq === "weeks" && rule.weekday !== undefined) {
    const [y, m, d] = today.split("-").map(Number);
    return ymd(y, m - 1, d + ((rule.weekday - weekdayOf(today) + 7) % 7));
  }
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * "Every day", "Every 2 weeks on Monday", "Every month on the 5th", "Every
 * quarter on the 30th", "Every 2 years": one string per rule wherever it
 * shows (the menu, the rail line, a row's subline; docs/specs/selectors.md
 * 3.9). `short` gives the weekday in three letters ("Every week on Mon").
 * `from` is the date the rule is read against: a yearly rule has no day of
 * its own, so with it a yearly rule says "Every year on Oct 30".
 */
export function describeRepeat(rule: RepeatRule, { short = false, from }: { short?: boolean; from?: Ymd | null } = {}): string {
  const n = rule.interval;
  const on = rule.dayOfMonth ? ` on the ${ordinal(rule.dayOfMonth)}` : "";
  const date = toYmd(from);
  switch (rule.freq) {
    case "days":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "weeks":
      return (n === 1 ? "Every week" : `Every ${n} weeks`) + (rule.weekday !== undefined ? ` on ${short ? WEEKDAYS[rule.weekday].slice(0, 3) : WEEKDAYS[rule.weekday]}` : "");
    case "monthly":
      return (n === 1 ? "Every month" : `Every ${n} months`) + on;
    case "quarterly":
      return (n === 1 ? "Every quarter" : `Every ${n} quarters`) + on;
    case "yearly": {
      const day = date ? ` on ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}` : "";
      return (n === 1 ? "Every year" : `Every ${n} years`) + day;
    }
  }
}

/** The same rule, however Postgres ordered its keys or left a missing pin out: for comparing two rules. */
export function ruleKey(rule: RepeatRule | null): string {
  return rule ? [rule.freq, rule.interval, rule.dayOfMonth ?? "", rule.weekday ?? ""].join("|") : "none";
}

/** One row of the repeat menu: a rule (null is "Doesn't repeat") and what it says and does from a date. */
export interface RepeatPreset {
  key: "none" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  rule: RepeatRule | null;
  label: string;
  /** The date the next copy gets, for the "Next: Fri, Nov 6" line. Null for "Doesn't repeat". */
  next: Ymd | null;
}

/**
 * The presets, read from a date (the task's due date, or today when it has
 * none): the weekday and the day of the month come from it, so "Every week
 * on Fri" is the due date's own Friday. A repeat menu lists these in order,
 * then Custom (selectors 3.9). Yearly isn't pinned, as the editor never
 * pinned it: a pin would undo a renewal date someone moved. Each `next` is the
 * date finishing the task would give the copy (`nextRepeatDue`): with a due
 * date that is already late, pass `today` so it is never a day gone by.
 */
export function repeatPresets(from: Ymd, today: Ymd = from): RepeatPreset[] {
  const weekday = weekdayOf(from);
  const dayOfMonth = Number(from.slice(8, 10));
  const rules: Pick<RepeatPreset, "key" | "rule">[] = [
    { key: "none", rule: null },
    { key: "weekly", rule: { freq: "weeks", interval: 1, weekday } },
    { key: "biweekly", rule: { freq: "weeks", interval: 2, weekday } },
    { key: "monthly", rule: { freq: "monthly", interval: 1, dayOfMonth } },
    { key: "quarterly", rule: { freq: "quarterly", interval: 1, dayOfMonth } },
    { key: "yearly", rule: { freq: "yearly", interval: 1 } },
  ];
  return rules.map(({ key, rule }) => ({
    key,
    rule,
    label: rule ? describeRepeat(rule, { short: true, from }) : "Doesn't repeat",
    next: rule ? nextRepeatDue(rule, from, today) : null,
  }));
}

/** The preset a stored rule is, or null when it matches none ("Every 3 days", "Every 2 months", a weekday off the due date's). */
export function matchPreset(rule: RepeatRule | null, presets: readonly RepeatPreset[]): RepeatPreset | null {
  const key = ruleKey(rule);
  return presets.find((p) => ruleKey(p.rule) === key) ?? null;
}

// ---------------------------------------------------------------------------
// One copy per finish (core.ts createNextRepeat and setStatus)
// ---------------------------------------------------------------------------

function record(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

/**
 * The copy a REPEAT_CREATED event points at, from its stored data, and the
 * date it was given. Null for data that doesn't name one. `madeInAsana` marks
 * Asana's own copy, which the importer joined to the series
 * (src/lib/asana/import.ts joinSeries).
 */
export function repeatCreatedCopy(data: unknown): { next: string; madeInAsana: boolean; due: Ymd | null } | null {
  const d = record(data);
  if (!d || typeof d.next !== "string" || !d.next) return null;
  return { next: d.next, madeInAsana: d.madeInAsana === true, due: typeof d.due === "string" ? toYmd(d.due) : null };
}

/**
 * Where a copy came from, from its CREATED event's data: the task whose
 * finish made it, and the date the series gave it then (null on a copy made
 * before that was kept). Null for a task that isn't a copy.
 */
export function copyOrigin(data: unknown): { repeatOf: string; due: Ymd | null } | null {
  const d = record(data);
  if (!d || typeof d.repeatOf !== "string" || !d.repeatOf) return null;
  return { repeatOf: d.repeatOf, due: typeof d.due === "string" ? toYmd(d.due) : null };
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
