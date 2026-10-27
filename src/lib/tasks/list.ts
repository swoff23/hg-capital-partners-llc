import type { TaskStatus } from "@prisma/client";
import { daysUntil, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { OVERDUE_ELIGIBLE, isActiveStatus, statusRank } from "@/lib/task-scope";
import { parseRepeatRule, type RepeatRule } from "./repeat";
import { targetDate } from "./rules";

/**
 * The staff task lists: Today (Mine | Contractors) and All
 * (docs/asana-migration-plan.md §6, D7, D8, D31). What a row carries, how
 * rows group into sections and sort, and the optimistic edits the lists make
 * while a save is in flight. Pure and safe in the browser; the queries that
 * fill it live in ./queries. See list.test.ts.
 */

export type ListAssignee =
  | { kind: "user"; id: string; name: string | null; email: string }
  | { kind: "contact"; id: string; name: string }
  /** Legacy free text from the CSV import, with no real person behind it. */
  | { kind: "name"; name: string };

/** One row, serializable from the server page to the client list. */
export interface ListTask {
  id: string;
  title: string;
  status: TaskStatus;
  /** The checkbox's state. Starts as status === DONE; flips at once when tapped. */
  checked: boolean;
  due: Ymd | null;
  /** The booked visit date while Scheduled. */
  scheduledFor: Ymd | null;
  waitingOn: string | null;
  unitLabel: string | null;
  propertyId: string | null;
  /** Short address of the property, or of the deal when there's no property. */
  place: string | null;
  assignee: ListAssignee | null;
  /** How it repeats, or null: the Repeats filter and the cadence under a row's title. */
  repeat: RepeatRule | null;
  /** ISO instant, for a stable order among equals. */
  createdAt: string;
  /**
   * Something new for the signed-in partner since they last opened it
   * (read-state.ts unreadTaskIds): the row's unread dot, and it opens at the
   * New divider. Set by the list queries; absent reads as nothing new.
   */
  unread?: boolean;
}

/** The fields the queries select, as Prisma returns them. */
export interface ListTaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  scheduledFor: Date | null;
  waitingOn: string | null;
  unitLabel: string | null;
  assigneeName: string | null;
  createdAt: Date;
  property: { id: string; address: string } | null;
  deal: { address: string } | null;
  assignee: { id: string; name: string | null; email: string } | null;
  assigneeContact: { id: string; fullName: string } | null;
  /** The stored rule (Json); a row without one, or one that doesn't parse, doesn't repeat. */
  repeatRule?: unknown;
}

export function toListTask(r: ListTaskRecord): ListTask {
  const assignee: ListAssignee | null = r.assignee
    ? { kind: "user", id: r.assignee.id, name: r.assignee.name, email: r.assignee.email }
    : r.assigneeContact
      ? { kind: "contact", id: r.assigneeContact.id, name: r.assigneeContact.fullName }
      : r.assigneeName
        ? { kind: "name", name: r.assigneeName }
        : null;
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    checked: r.status === "DONE",
    due: toYmd(r.dueDate),
    scheduledFor: toYmd(r.scheduledFor),
    waitingOn: r.waitingOn,
    unitLabel: r.unitLabel,
    propertyId: r.property?.id ?? null,
    place: shortAddress(r.property?.address ?? r.deal?.address) || null,
    assignee,
    repeat: parseRepeatRule(r.repeatRule),
    createdAt: r.createdAt.toISOString(),
  };
}

export const isContractorJob = (t: ListTask) => t.assignee?.kind === "contact";

/** What a person's name reads as on a row. */
export function assigneeName(a: ListAssignee | null): string | null {
  if (!a) return null;
  if (a.kind === "user") return a.name ?? a.email;
  return a.name;
}

/** Target (D7): the visit date while Scheduled, otherwise Due. Same rule as rules.ts targetDate. */
export function targetOf(t: Pick<ListTask, "status" | "scheduledFor" | "due">): Ymd | null {
  return toYmd(targetDate({ status: t.status, scheduledFor: ymdToDate(t.scheduledFor), dueDate: ymdToDate(t.due) }));
}

/** Which column the row's date chip edits: the visit date for a Scheduled job, otherwise Due. */
export type DateField = "dueDate" | "scheduledFor";

export function targetField(t: Pick<ListTask, "status" | "scheduledFor">): DateField {
  return t.status === "SCHEDULED" && t.scheduledFor ? "scheduledFor" : "dueDate";
}

const before = (v: Ymd | null, today: Ymd) => {
  const d = daysUntil(v, today);
  return d != null && d < 0;
};

/** Overdue: still open, due before today, and not Waiting or Review (§5.2). */
export function isOverdue(t: Pick<ListTask, "status" | "due">, today: Ymd): boolean {
  return (OVERDUE_ELIGIBLE as readonly TaskStatus[]).includes(t.status) && before(t.due, today);
}

/** A contractor job whose Target has passed, by the same rule as Overdue. */
export function isTargetLate(t: Pick<ListTask, "status" | "scheduledFor" | "due">, today: Ymd): boolean {
  return (OVERDUE_ELIGIBLE as readonly TaskStatus[]).includes(t.status) && before(targetOf(t), today);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** What the comparator needs from a row: a ListTask, or a Prisma task row (the property page's Tasks card). */
export interface SortableTask {
  id: string;
  status: TaskStatus;
  createdAt: string | Date;
}

const iso = (v: string | Date) => (typeof v === "string" ? v : v.toISOString());

/** Dates ascending with no date last, then status (statusRank), then newest first. */
export function byDateThenStatus<T extends SortableTask>(date: (t: T) => Ymd | null) {
  return (a: T, b: T): number => {
    const x = date(a);
    const y = date(b);
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    }
    const s = statusRank(a.status) - statusRank(b.status);
    if (s !== 0) return s;
    const ca = iso(a.createdAt);
    const cb = iso(b.createdAt);
    if (ca !== cb) return ca < cb ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Staff rows: by Due. */
export const compareByDue = byDateThenStatus<ListTask>((t) => t.due);
/** Contractor jobs: by Target. */
export const compareByTarget = byDateThenStatus<ListTask>(targetOf);

// ---------------------------------------------------------------------------
// Today: Mine
// ---------------------------------------------------------------------------

export interface MineGroups {
  /** Nobody real owns it (no user, no contractor), so both partners see it. */
  unassigned: ListTask[];
  overdue: ListTask[];
  today: ListTask[];
  waiting: ListTask[];
  noDate: ListTask[];
}

/**
 * The Mine column. Unassigned first, then the signed-in partner's own active
 * tasks: Overdue, due Today, Waiting (any date), and No date. Tasks due after
 * today aren't on Today, assigned or not (a key-date reminder for next
 * spring waits on All). A Review task of their own that's past due sits in
 * Today, since Review is never overdue. Closed tasks and contractor jobs are
 * skipped.
 */
export function groupMine(tasks: ListTask[], userId: string, today: Ymd): MineGroups {
  const g: MineGroups = { unassigned: [], overdue: [], today: [], waiting: [], noDate: [] };
  for (const t of tasks) {
    if (!isActiveStatus(t.status)) continue;
    const a = t.assignee;
    const dueByToday = !t.due || (daysUntil(t.due, today) ?? 1) <= 0;
    if (!a || a.kind === "name") {
      if (dueByToday || t.status === "WAITING") g.unassigned.push(t);
      continue;
    }
    if (a.kind !== "user" || a.id !== userId) continue;
    if (t.status === "WAITING") g.waiting.push(t);
    else if (isOverdue(t, today)) g.overdue.push(t);
    else if (!t.due) g.noDate.push(t);
    else if (dueByToday) g.today.push(t);
  }
  for (const list of Object.values(g)) list.sort(compareByDue);
  return g;
}

// ---------------------------------------------------------------------------
// Today: Contractors
// ---------------------------------------------------------------------------

export interface ContractorGroup {
  contactId: string;
  name: string;
  jobs: ListTask[];
}

export interface ContractorColumn {
  /** Marked done by the contractor, waiting on Approve or Send back. */
  review: ListTask[];
  groups: ContractorGroup[];
}

/**
 * The Contractors column (D8: both partners see every contractor job).
 * Needs review on top, then one group per contractor with their other
 * active jobs by Target. Groups go in order of their soonest Target, so
 * whoever is due on site next comes first; undated groups last, by name.
 */
export function groupContractors(tasks: ListTask[]): ContractorColumn {
  const review: ListTask[] = [];
  const byContact = new Map<string, ContractorGroup>();
  for (const t of tasks) {
    if (!isActiveStatus(t.status) || t.assignee?.kind !== "contact") continue;
    if (t.status === "REVIEW") {
      review.push(t);
      continue;
    }
    const { id, name } = t.assignee;
    const group = byContact.get(id) ?? { contactId: id, name, jobs: [] };
    group.jobs.push(t);
    byContact.set(id, group);
  }
  review.sort(compareByTarget);
  const groups = [...byContact.values()];
  for (const g of groups) g.jobs.sort(compareByTarget);
  groups.sort((a, b) => {
    const x = targetOf(a.jobs[0]);
    const y = targetOf(b.jobs[0]);
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return { review, groups };
}

// ---------------------------------------------------------------------------
// Optimistic edits
// ---------------------------------------------------------------------------

/** A date as it was before a move, so Undo can put it back. */
export interface DateChange {
  id: string;
  field: DateField;
  value: Ymd | null;
}

export type ListPatch =
  | { kind: "dates"; changes: DateChange[] }
  | { kind: "check"; id: string; checked: boolean }
  | { kind: "status"; id: string; status: TaskStatus }
  /** The row as it was, back in the list: Undo after a tick, once the refresh has dropped it. */
  | { kind: "restore"; task: ListTask };

/** The list as it should look while a save is in flight. */
export function applyPatch(tasks: ListTask[], patch: ListPatch): ListTask[] {
  switch (patch.kind) {
    case "dates": {
      const byId = new Map(patch.changes.map((c) => [c.id, c]));
      return tasks.map((t) => {
        const c = byId.get(t.id);
        if (!c) return t;
        return c.field === "dueDate" ? { ...t, due: c.value } : { ...t, scheduledFor: c.value };
      });
    }
    case "check":
      return tasks.map((t) => (t.id === patch.id ? { ...t, checked: patch.checked } : t));
    case "status":
      return tasks.map((t) => (t.id === patch.id ? { ...t, status: patch.status, checked: patch.status === "DONE" } : t));
    case "restore":
      return tasks.some((t) => t.id === patch.task.id) ? tasks.map((t) => (t.id === patch.task.id ? patch.task : t)) : [...tasks, patch.task];
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** The reschedule toast: "Moved to Mon Oct 27", or "Date removed". */
export function movedMessage(value: Ymd | null): string {
  const y = toYmd(value);
  if (!y) return "Date removed";
  const [yr, m, d] = y.split("-").map(Number);
  const day = new Date(Date.UTC(yr, m - 1, d));
  const part = (o: Intl.DateTimeFormatOptions) => day.toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  return `Moved to ${part({ weekday: "short" })} ${part({ month: "short" })} ${d}`;
}

/** "Moved 3 tasks to today". */
export function movedAllMessage(count: number): string {
  return `Moved ${count} ${count === 1 ? "task" : "tasks"} to today`;
}

/** What a tick that finished a task did: the next copy's due date when it repeats. */
export interface TickResult {
  nextDue: Ymd | null;
}

/**
 * The Done toast: "Done: Call plumber", or for a repeat "Done. Next due
 * Nov 5", short enough for a 320 phone. The year shows only when the date is
 * more than about 11 months out, so a monthly copy made in December reads
 * "Jan 5" and a yearly one "Oct 22, 2027".
 */
export function doneMessage(title: string, nextDue: Ymd | null, today: Ymd): string {
  if (!nextDue) return `Done: ${title}`;
  const ahead = daysUntil(nextDue, today);
  if (ahead === null) return `Done: ${title}`;
  if (ahead === 0) return "Done. Next due today";
  const [y, m, d] = toYmd(nextDue)!.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(ahead > 334 ? { year: "numeric" } : {}),
  });
  return `Done. Next due ${date}`;
}

// ---------------------------------------------------------------------------
// Email cap (D30)
// ---------------------------------------------------------------------------

/** Resend's free plan sends 100 emails a day. */
export const EMAIL_DAILY_CAP = 100;
