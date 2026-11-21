import "server-only";
import { Prisma, type TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { toYmd, type Ymd } from "@/lib/dates";
import { logError } from "@/lib/log";
import { isActiveStatus, isDraftStatus } from "@/lib/task-scope";
import * as core from "./core";
import { assignEach, deleteEach, moveDatesEach, setPropertyEach, setStatusEach, undoAssignEach, undoDatesEach, undoPropertyEach, undoStatusEach } from "./bulk-core";
import type { AssignChange, AssignPick, DateMove, DeleteOutcome, PropertyChange, StatusChange, StatusPick } from "./bulk-core";
import type { DateChange } from "./list";
import { deleteTask } from "./service";

/**
 * Moving dates on several tasks at once: "Move all to today" on Today, and
 * the Undo after any reschedule (D7). Each task still goes through
 * core.patchTask, so it gets its own timeline line and, on a contractor's
 * job, the email the move calls for. All of a batch commits together or not
 * at all.
 *
 * Neither touches a draft from Claude (docs/specs/tasks-from-claude.md 6.2):
 * a draft isn't active, so a move passes it over, and an Undo skips a task
 * that has become a draft again since its date moved (an Add's Undo).
 *
 * Both take their tasks in id order, as every write that holds more than one
 * task does (renameTaskUnits; a reopen and Approve's Undo hold the finished
 * task, then the repeat copy it made). Those orders agree only because ids
 * sort by when the task was made: Prisma's cuid() (v1) starts with "c" and
 * the time in base 36, and so does the importer's newTaskId
 * (scripts/asana/_import-lib.ts), so a repeat copy always sorts after the
 * task it was made from. If ids stop sorting by time (cuid2, UUIDs), an Undo
 * here holding a copy and waiting on its parent could meet a reopen holding
 * the parent and waiting on the copy, and Postgres aborts one (40P01). A new
 * id scheme needs copies taken after their parents some other way first.
 */

/** A batch makes several round trips per task; give a busy Overdue list room. */
const TX = { timeout: 20_000, maxWait: 10_000 };

function revalidate(rows: { id: string; propertyId: string | null; dealId: string | null }[], extraPropertyIds: (string | null)[] = []): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  for (const r of rows) revalidatePath(`/tasks/${r.id}`);
  for (const p of new Set([...rows.map((r) => r.propertyId), ...extraPropertyIds])) if (p) revalidatePath(`/properties/${p}`);
  for (const d of new Set(rows.map((r) => r.dealId))) if (d) revalidatePath(`/deals/${d}`);
}

/**
 * Move active tasks to `to` (null clears). `which` picks the date
 * (docs/specs/contractor-scheduled-date.md):
 *   "due"       the due date: every row's date chip, contractor jobs
 *               included, and "Move all to today";
 *   "scheduled" a Scheduled job's scheduled day: the Tasks page's Scheduled
 *               column. A job that isn't Scheduled is skipped, and it can't
 *               be cleared (staff clear it by changing the status).
 * Closed tasks, drafts, tasks deleted since the list was drawn and dates
 * already at `to` are skipped. Returns each moved date as it was, for Undo.
 */
export async function moveTaskDates(ids: string[], to: Ymd | null, which: "due" | "scheduled", p: core.Principal): Promise<DateChange[]> {
  const value = to === null ? null : toYmd(to);
  if (to !== null && !value) throw new core.TaskRuleError("That isn't a date.");
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { moved, rows } = await prisma.$transaction(async (tx) => {
    // Locked as they are read, in the database's id order, so two batches that share tasks (both partners' "Move all
    // to today") take them the same way round. Held from here, a task can't be deleted between this read and its
    // patch, which would fail the whole batch, and its status is the one it has now: one closed first is skipped, not
    // moved. A task deleted before the read isn't read, and is skipped. NO KEY UPDATE, the lock patchTask's update takes.
    const rows = await tx.$queryRaw<
      { id: string; status: TaskStatus; dueDate: Date | null; scheduledFor: Date | null; propertyId: string | null; dealId: string | null }[]
    >`
      SELECT "id", "status", "dueDate", "scheduledFor", "propertyId", "dealId" FROM "Task" WHERE "id" IN (${Prisma.join(unique)}) ORDER BY "id" FOR NO KEY UPDATE`;
    const moved: DateChange[] = [];
    for (const r of rows) {
      if (!isActiveStatus(r.status)) continue;
      const field = which === "scheduled" ? "scheduledFor" : "dueDate";
      if (field === "scheduledFor" && r.status !== "SCHEDULED") continue;
      if (field === "scheduledFor" && !value) throw new core.TaskRuleError("A scheduled job needs a day.");
      const was = toYmd(field === "dueDate" ? r.dueDate : r.scheduledFor);
      if (was === value) continue;
      await core.patchTask(tx, r.id, field === "dueDate" ? { dueDate: value } : { scheduledFor: value }, p);
      moved.push({ id: r.id, field, value: was });
    }
    return { moved, rows };
  }, TX);
  revalidate(rows);
  return moved;
}

/** Undo: put each date back as it was. Tasks deleted since are skipped, and so is one that is a draft again. */
export async function restoreTaskDates(changes: DateChange[], p: core.Principal): Promise<void> {
  if (!changes.length) return;
  const ids = [...new Set(changes.map((c) => c.id))];
  const rows = await prisma.$transaction(async (tx) => {
    // Locked as they are read, in the database's id order (as moveTaskDates takes them), whatever order the Undo's
    // list came in. Held from here, a task can't be deleted between this read and its patch, which would fail the
    // whole Undo; one deleted before it isn't read, and is skipped. NO KEY UPDATE, the lock patchTask's update takes.
    const rows = await tx.$queryRaw<{ id: string; status: TaskStatus; propertyId: string | null; dealId: string | null }[]>`
      SELECT "id", "status", "propertyId", "dealId" FROM "Task" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;
    for (const r of rows) {
      if (isDraftStatus(r.status)) continue;
      for (const c of changes) {
        if (c.id !== r.id) continue;
        await core.patchTask(tx, c.id, c.field === "dueDate" ? { dueDate: c.value } : { scheduledFor: c.value }, p);
      }
    }
    return rows;
  }, TX);
  revalidate(rows);
}

// ---------------------------------------------------------------------------
// Bulk edit on the Tasks list (docs/specs/bulk-edit.md); the rules are bulk-core.ts
//
// None of these touches a draft from Claude, whatever ids arrive
// (docs/specs/tasks-from-claude.md 6.2): each change and Undo takes its rows
// from bulk-core.ts lockTasks, which hands on tasks only, and Delete goes
// through deleteEach. Keep every new bulk write behind one of the two.
// ---------------------------------------------------------------------------

/** A status, assignee or property change on up to 400 tasks: room for each one's own rules and lines. */
const BULK_TX = { timeout: 60_000, maxWait: 10_000 };

export async function bulkSetStatus(
  picks: StatusPick[],
  to: TaskStatus,
  opts: { waitingOn?: string | null; scheduledFor?: Ymd | null },
  p: core.Principal,
) {
  const { rows, ...out } = await prisma.$transaction((tx) => setStatusEach(tx, picks, to, opts, p), BULK_TX);
  revalidate(rows);
  return out;
}

export async function undoBulkStatus(changes: StatusChange[], p: core.Principal) {
  const { rows, done, skipped } = await prisma.$transaction((tx) => undoStatusEach(tx, changes, p), BULK_TX);
  revalidate(rows);
  return { done, skipped };
}

export async function bulkAssign(picks: AssignPick[], to: core.Assignee, p: core.Principal) {
  const { rows, ...out } = await prisma.$transaction((tx) => assignEach(tx, picks, to, p), BULK_TX);
  revalidate(rows);
  return out;
}

export async function undoBulkAssign(changes: AssignChange[], p: core.Principal) {
  const { rows, done, skipped } = await prisma.$transaction((tx) => undoAssignEach(tx, changes, p), BULK_TX);
  revalidate(rows);
  return { done, skipped };
}

/** One due date for many (bulk-core.ts moveDatesEach). */
export async function bulkMoveDates(ids: string[], to: Ymd | null, p: core.Principal) {
  const { rows, ...out } = await prisma.$transaction((tx) => moveDatesEach(tx, ids, to, p), BULK_TX);
  revalidate(rows);
  return out;
}

/** Its Undo: each date back unless someone changed it since (bulk-core.ts undoDatesEach). */
export async function undoBulkMoveDates(moves: DateMove[], p: core.Principal) {
  const { rows, done, skipped } = await prisma.$transaction((tx) => undoDatesEach(tx, moves, p), BULK_TX);
  revalidate(rows);
  return { done, skipped };
}

export async function bulkSetProperty(ids: string[], propertyId: string | null, p: core.Principal) {
  const { rows, ...out } = await prisma.$transaction((tx) => setPropertyEach(tx, ids, propertyId, p), BULK_TX);
  revalidate(rows, [propertyId]);
  return out;
}

export async function undoBulkProperty(changes: PropertyChange[], p: core.Principal) {
  const { rows, done, skipped } = await prisma.$transaction((tx) => undoPropertyEach(tx, changes, p), BULK_TX);
  revalidate(rows, changes.map((c) => c.from.propertyId));
  return { done, skipped };
}

/**
 * Delete each task for good, files and all (service.deleteTask), one at a
 * time: each is its own transaction, and its files go once it commits. One
 * that fails is counted and the rest still go; one already gone counts as
 * deleted, since that's what was asked. A draft from Claude is left as it is
 * and counted apart (bulk-core.ts deleteEach; service.deleteTask refuses one
 * under the row's lock): a draft goes by Discard, on its own row or page.
 */
export async function bulkDeleteTasks(ids: string[], p: core.Principal): Promise<DeleteOutcome> {
  return deleteEach(
    prisma,
    ids,
    (id) => deleteTask(id, p),
    (err, id) => logError("tasks:bulk-delete", err, { taskId: id }),
  );
}
