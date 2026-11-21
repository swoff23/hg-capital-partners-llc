import { Prisma, type TaskStatus } from "@prisma/client";
import { toYmd, type Ymd } from "@/lib/dates";
import { unitAfterMove, unitLabels } from "@/lib/picker-options-shape";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "./core";
import type { DateChange } from "./list";
import { repeatCreatedCopy } from "./repeat";

/**
 * Bulk edit on the Tasks list (docs/specs/bulk-edit.md): one status, assignee
 * or property for many tasks at once, and each one's Undo. Every task goes
 * through core.setStatus or core.patchTask exactly as a single edit does, so
 * it gets its own timeline line, email, repeat copy and deal line. All of it
 * runs on the caller's transaction (bulk.ts opens it and refreshes the pages
 * after), so it can be tested on a real Postgres (bulk.pg.test.ts).
 *
 * The tasks are locked as they're read, in id order, as moveTaskDates takes
 * them (bulk.ts explains why the orders agree). Each task runs inside its own
 * savepoint: a refusal the rules make for one task (someone moved it since the
 * list loaded, a contractor archived since) rolls back just that task and
 * counts it as skipped, with its reason, while the rest go ahead. Anything
 * else fails the whole batch.
 */

export type BulkSkip = "closed" | "changed" | "gone" | "needsDate" | "refused";
export type BulkSkips = Partial<Record<BulkSkip, number>>;

export interface BulkOutcome<C> {
  /** What each changed task was before, for Undo. */
  changed: C[];
  /** Tasks now at what was asked: the changed ones and any that already were. */
  done: number;
  skipped: BulkSkips;
  /** The first refusal's own words ("Archived. Pick someone else."), when a rule refused a task, for the toast. */
  refusal?: string;
}

/** A picked row and the status it showed. */
export interface StatusPick {
  id: string;
  expected: TaskStatus;
}

/** A status change, as Undo needs it: where the task was, and where this put it. */
export interface StatusChange {
  id: string;
  from: TaskStatus;
  to: TaskStatus;
  /** What the task had before. */
  waitingOn: string | null;
  scheduledFor: Ymd | null;
  /** What this change left it with, so Undo leaves a task whose reason or visit date someone changed since. */
  setWaitingOn: string | null;
  setScheduledFor: Ymd | null;
  /** The Done line, when this change was an approval: Undo goes back the way Approve's Undo does. */
  approvedEventId: string | null;
}

/** A picked row and who it showed. */
export interface AssignPick {
  id: string;
  expected: core.Assignee;
}

export interface AssignChange {
  id: string;
  from: core.Assignee;
  to: core.Assignee;
  /** An imported free-text name (the Asana import's) the task had before, which Undo puts back. */
  fromName?: string | null;
}

/** A date this moved, as Undo needs it: the field, what it was (`value`) and what this set (`set`). */
export interface DateMove extends DateChange {
  set: Ymd | null;
}

export interface PropertyChange {
  id: string;
  from: { propertyId: string | null; unitLabel: string | null };
  to: { propertyId: string | null; unitLabel: string | null };
}

/** What a task's row holds while it's locked. */
export interface LockedTask {
  id: string;
  status: TaskStatus;
  waitingOn: string | null;
  scheduledFor: Date | null;
  dueDate: Date | null;
  propertyId: string | null;
  unitLabel: string | null;
  dealId: string | null;
  assigneeUserId: string | null;
  assigneeContactId: string | null;
  assigneeName: string | null;
}

/** An Undo found the task moved on from what the change set, or a change found it moved since: it's left as it is. */
class ChangedSince extends core.TaskRuleError {
  constructor() {
    super("Changed since.");
    this.name = "ChangedSince";
  }
}

/** A date for a closed task: left as it is, as "Move all to today" leaves one. */
class Closed extends core.TaskRuleError {
  constructor() {
    super("Closed.");
    this.name = "Closed";
  }
}

/** Clearing a Scheduled job's day: it needs one, so it's left as it is. */
class NeedsDate extends core.TaskRuleError {
  constructor() {
    super("A scheduled job needs a day.");
    this.name = "NeedsDate";
  }
}

/** The skip a rule refusal stands for; null for anything that isn't one, which fails the batch. */
export function skipFor(err: unknown): BulkSkip | null {
  if (err instanceof core.TaskChangedError || err instanceof core.AssigneeChangedError || err instanceof ChangedSince) return "changed";
  if (err instanceof Closed) return "closed";
  if (err instanceof NeedsDate) return "needsDate";
  if (err instanceof core.TaskRuleError) return err.message === "That task no longer exists." ? "gone" : "refused";
  return null;
}

export function addSkip(skips: BulkSkips, reason: BulkSkip, n = 1): void {
  skips[reason] = (skips[reason] ?? 0) + n;
}

/**
 * The repeat copy each of these tasks last made (its latest REPEAT_CREATED
 * line), the row a reopen or Approve's Undo takes back (core.ts
 * takeBackRepeat, undoApproval).
 */
async function repeatCopiesOf(tx: core.Tx, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const lines = await tx.$queryRaw<{ data: unknown }[]>`
    SELECT DISTINCT ON ("taskId") "data" FROM "TaskEvent"
    WHERE "taskId" IN (${Prisma.join([...ids])}) AND "kind" = 'REPEAT_CREATED'
    ORDER BY "taskId", "createdAt" DESC, "id" DESC`;
  return lines.flatMap((l) => {
    const copy = repeatCreatedCopy(l.data);
    return copy ? [copy.next] : [];
  });
}

/**
 * Locks these tasks as it reads them, in id order, and returns them. A task
 * deleted since the list loaded isn't read; the caller counts it as gone.
 *
 * `withCopies`: a status change that can reopen a closed task, or Undo a
 * finish, also takes the repeat copy each closed one last made. Taken here,
 * in the same id-ordered statement, every lock this batch holds is in id
 * order, as bulk.ts requires; taken inside the reopen instead, a copy could
 * come after a pick with a later id that is already held.
 */
export async function lockTasks(tx: core.Tx, ids: readonly string[], { withCopies = false } = {}): Promise<LockedTask[]> {
  if (!ids.length) return [];
  const extra = withCopies ? await repeatCopiesOf(tx, ids) : [];
  const all = [...new Set([...ids, ...extra])];
  const rows = await tx.$queryRaw<LockedTask[]>`
    SELECT "id", "status", "waitingOn", "scheduledFor", "dueDate", "propertyId", "unitLabel", "dealId", "assigneeUserId", "assigneeContactId", "assigneeName"
    FROM "Task" WHERE "id" IN (${Prisma.join(all)}) ORDER BY "id" FOR NO KEY UPDATE`;
  const picked = new Set(ids);
  return rows.filter((r) => picked.has(r.id));
}

/**
 * Runs `each` for every locked task, one savepoint apiece, and collects what
 * it returns: a change for Undo, "done" for a task that changed with nothing
 * to undo or already was where asked. A rule refusal rolls back that task
 * alone and counts as a skip.
 */
async function eachTask<C>(
  tx: core.Tx,
  ids: readonly string[],
  each: (row: LockedTask) => Promise<C | "done">,
  lock: { withCopies?: boolean } = {},
): Promise<BulkOutcome<C> & { rows: LockedTask[] }> {
  const unique = [...new Set(ids)];
  const rows = await lockTasks(tx, unique, lock);
  const out: BulkOutcome<C> = { changed: [], done: 0, skipped: {} };
  if (rows.length < unique.length) addSkip(out.skipped, "gone", unique.length - rows.length);
  for (const row of rows) {
    await tx.$executeRaw`SAVEPOINT bulk_task`;
    try {
      const result = await each(row);
      await tx.$executeRaw`RELEASE SAVEPOINT bulk_task`;
      out.done += 1;
      if (result !== "done") out.changed.push(result);
    } catch (err) {
      const reason = skipFor(err);
      if (!reason) throw err;
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT bulk_task`;
      addSkip(out.skipped, reason);
      if (reason === "refused" && !out.refusal && err instanceof Error) out.refusal = err.message;
    }
  }
  return { ...out, rows };
}

/** The row's assignee as the service compares it. An imported name alone is nobody. */
function assigneeOf(row: Pick<LockedTask, "assigneeUserId" | "assigneeContactId">): core.Assignee {
  if (row.assigneeUserId) return { userId: row.assigneeUserId };
  if (row.assigneeContactId) return { contactId: row.assigneeContactId };
  return null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * One status for every pick. Waiting takes one reason and Scheduled one visit
 * date for all of them. A task whose row already showed that status counts as
 * done, a Waiting one taking the new reason and a Scheduled one the new visit
 * date. Every other task is sent with the status its row showed, so one
 * someone moved since is skipped, even when they moved it to the status
 * asked: their reason or visit date stands. Needs review to Done is an
 * approval, as one at a time.
 */
export async function setStatusEach(
  tx: core.Tx,
  picks: readonly StatusPick[],
  to: TaskStatus,
  opts: { waitingOn?: string | null; scheduledFor?: Ymd | null },
  p: core.Principal,
) {
  const expected = new Map(picks.map((x) => [x.id, x.expected]));
  return eachTask<StatusChange>(
    tx,
    picks.map((x) => x.id),
    async (row) => {
      const was = { waitingOn: row.waitingOn, scheduledFor: toYmd(row.scheduledFor) };
      const reason = to === "WAITING" ? (opts.waitingOn?.trim() ?? null) : null;
      // What the task is left with: a reason only while Waiting, the visit date kept unless Scheduled sets one.
      const set = { setWaitingOn: reason, setScheduledFor: to === "SCHEDULED" ? (opts.scheduledFor ?? null) : was.scheduledFor };
      const change: StatusChange = { id: row.id, from: row.status, to, ...was, ...set, approvedEventId: null };
      if (row.status === to) {
        // Someone moved it here since the list loaded: what was asked holds, and their reason or date stands.
        if (expected.get(row.id) !== to) throw new ChangedSince();
        if (to === "WAITING" && reason && reason !== row.waitingOn) {
          await core.patchTask(tx, row.id, { waitingOn: reason }, p);
          return change;
        }
        if (to === "SCHEDULED" && opts.scheduledFor && opts.scheduledFor !== was.scheduledFor) {
          await core.patchTask(tx, row.id, { scheduledFor: opts.scheduledFor }, p);
          return change;
        }
        return "done";
      }
      const result = await core.setStatus(tx, row.id, to, p, {
        expected: expected.get(row.id),
        ...(to === "WAITING" ? { waitingOn: opts.waitingOn ?? null } : {}),
        ...(to === "SCHEDULED" ? { scheduledFor: opts.scheduledFor ?? null } : {}),
      });
      return { ...change, approvedEventId: row.status === "REVIEW" && to === "DONE" ? result.statusEventId : null };
    },
    // Reopening a closed task takes back the repeat copy it made: lock those too, in order.
    { withCopies: isActiveStatus(to) },
  );
}

/**
 * Undo: each task back where it was, with its waiting reason and visit date.
 * A task someone changed since (its status, or the reason or visit date this
 * change set) is skipped. A finished task goes back as the Done toast's Undo
 * takes it (an untouched repeat copy is taken back); an approval as
 * Approve's Undo.
 */
export async function undoStatusEach(tx: core.Tx, changes: readonly StatusChange[], p: core.Principal) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return eachTask<never>(
    tx,
    changes.map((c) => c.id),
    async (row) => {
      const c = byId.get(row.id)!;
      if (row.status !== c.to) throw new ChangedSince();
      if (c.to === "WAITING" && row.waitingOn !== c.setWaitingOn) throw new ChangedSince();
      if (c.to === "SCHEDULED" && toYmd(row.scheduledFor) !== c.setScheduledFor) throw new ChangedSince();
      if (c.approvedEventId) {
        await core.undoApproval(tx, row.id, c.approvedEventId, p);
      } else if (c.from === c.to) {
        await core.patchTask(tx, row.id, c.to === "WAITING" ? { waitingOn: c.waitingOn } : { scheduledFor: c.scheduledFor }, p);
      } else {
        await core.setStatus(tx, row.id, c.from, p, {
          expected: c.to,
          scheduledFor: c.scheduledFor,
          ...(c.from === "WAITING" ? { waitingOn: c.waitingOn } : {}),
        });
      }
      return "done";
    },
    // Undoing a finish reopens it, which takes back its repeat copy: lock those too, in order.
    { withCopies: changes.some((c) => !isActiveStatus(c.to)) },
  );
}

// ---------------------------------------------------------------------------
// Assignee
// ---------------------------------------------------------------------------

/**
 * One assignee for every pick (null for nobody). Each is sent with the
 * assignee its row showed, so one someone reassigned since is skipped, and an
 * archived contractor is refused for open work, as one at a time. `emails` is
 * how many of these jobs queued the new contractor an email.
 */
export async function assignEach(tx: core.Tx, picks: readonly AssignPick[], to: core.Assignee, p: core.Principal) {
  const expected = new Map(picks.map((x) => [x.id, x.expected]));
  let handed = 0;
  const out = await eachTask<AssignChange>(
    tx,
    picks.map((x) => x.id),
    async (row) => {
      if (core.isAssignee(row, to)) return "done";
      await core.patchTask(tx, row.id, { assignee: to, expectedAssignee: expected.get(row.id) ?? null }, p);
      if (to && "contactId" in to) handed += 1;
      // An imported name (no person behind it) is cleared by a real pick; Undo puts the name back.
      const fromName = !row.assigneeUserId && !row.assigneeContactId ? row.assigneeName : null;
      return { id: row.id, from: assigneeOf(row), to, ...(fromName ? { fromName } : {}) };
    },
  );
  const emails = handed && to && "contactId" in to && (await core.contractorGetsEmail(tx, to.contactId)) ? handed : 0;
  return { ...out, emails };
}

/** Undo: each back to who had it, expecting the assignee the change set. */
export async function undoAssignEach(tx: core.Tx, changes: readonly AssignChange[], p: core.Principal) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return eachTask<never>(
    tx,
    changes.map((c) => c.id),
    async (row) => {
      const c = byId.get(row.id)!;
      // Someone reassigned or unassigned it since: their change stands, the imported name included.
      if (!core.isAssignee(row, c.to)) throw new ChangedSince();
      await core.patchTask(tx, row.id, { assignee: c.from, expectedAssignee: c.to }, p);
      // The imported name it had: nobody in the database, so it goes back as the text it was (display only).
      if (c.fromName) await tx.task.update({ where: { id: row.id }, data: { assigneeName: c.fromName } });
      return "done";
    },
  );
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

/**
 * One property for every pick (null for none). A task keeps its unit when the
 * new building has a unit by that name, and loses it otherwise (unitAfterMove,
 * the task page's rule).
 */
export async function setPropertyEach(tx: core.Tx, ids: readonly string[], propertyId: string | null, p: core.Principal) {
  let units: string[] = [];
  if (propertyId) {
    const property = await tx.property.findUnique({ where: { id: propertyId }, select: { units: true } });
    if (!property) throw new core.TaskRuleError("That property no longer exists.");
    units = unitLabels(property.units);
  }
  return eachTask<PropertyChange>(tx, ids, async (row) => {
    // Already on that building: it keeps its unit, as re-picking a task's own property on its page changes nothing.
    if (row.propertyId === propertyId) return "done";
    const unitLabel = propertyId ? unitAfterMove(row.unitLabel, units) : null;
    await core.patchTask(tx, row.id, { propertyId, ...(unitLabel === row.unitLabel ? {} : { unitLabel }) }, p);
    return { id: row.id, from: { propertyId: row.propertyId, unitLabel: row.unitLabel }, to: { propertyId, unitLabel } };
  });
}

/** Undo: each back to its old property and unit, unless someone moved it since. */
export async function undoPropertyEach(tx: core.Tx, changes: readonly PropertyChange[], p: core.Principal) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return eachTask<never>(
    tx,
    changes.map((c) => c.id),
    async (row) => {
      const c = byId.get(row.id)!;
      if (row.propertyId !== c.to.propertyId || row.unitLabel !== c.to.unitLabel) throw new ChangedSince();
      await core.patchTask(tx, row.id, { propertyId: c.from.propertyId, unitLabel: c.from.unitLabel }, p);
      return "done";
    },
  );
}

// ---------------------------------------------------------------------------
// Due date
// ---------------------------------------------------------------------------

/**
 * One due date for every pick (null clears), contractor jobs included: a
 * job's scheduled day is the contractor's, and bulk edit never moves it
 * (docs/specs/contractor-scheduled-date.md). A closed task is skipped.
 * Returns each moved date as it was and as this set it, for Undo
 * (undoDatesEach).
 */
export async function moveDatesEach(tx: core.Tx, ids: readonly string[], to: Ymd | null, p: core.Principal) {
  const value = to === null ? null : toYmd(to);
  if (to !== null && !value) throw new core.TaskRuleError("That isn't a date.");
  return eachTask<DateMove>(tx, ids, async (row) => {
    if (!isActiveStatus(row.status)) throw new Closed();
    const was = toYmd(row.dueDate);
    if (was === value) return "done";
    await core.patchTask(tx, row.id, { dueDate: value }, p);
    return { id: row.id, field: "dueDate" as const, value: was, set: value };
  });
}

/**
 * Undo: each date back as it was, unless someone changed it since or the
 * task closed since. Those are left as they are and counted.
 */
export async function undoDatesEach(tx: core.Tx, moves: readonly DateMove[], p: core.Principal) {
  const byId = new Map(moves.map((m) => [m.id, m]));
  return eachTask<never>(
    tx,
    moves.map((m) => m.id),
    async (row) => {
      const m = byId.get(row.id)!;
      if (!isActiveStatus(row.status)) throw new Closed();
      if (toYmd(m.field === "dueDate" ? row.dueDate : row.scheduledFor) !== m.set) throw new ChangedSince();
      // A Scheduled job keeps its day: Undo can't take it back to none.
      if (m.field === "scheduledFor" && row.status === "SCHEDULED" && !m.value) throw new NeedsDate();
      await core.patchTask(tx, row.id, m.field === "dueDate" ? { dueDate: m.value } : { scheduledFor: m.value }, p);
      return "done";
    },
  );
}
