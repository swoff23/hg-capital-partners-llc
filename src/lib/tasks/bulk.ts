import "server-only";
import { Prisma, type TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { toYmd, type Ymd } from "@/lib/dates";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "./core";
import { targetField, type DateChange } from "./list";

/**
 * Moving dates on several tasks at once: "Move all to today" on Today, and
 * the Undo after any reschedule (D7). Each task still goes through
 * core.patchTask, so it gets its own timeline line and, on a contractor's
 * job, the email the move calls for. All of a batch commits together or not
 * at all.
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

function revalidate(rows: { id: string; propertyId: string | null; dealId: string | null }[]): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  for (const r of rows) revalidatePath(`/tasks/${r.id}`);
  for (const p of new Set(rows.map((r) => r.propertyId))) if (p) revalidatePath(`/properties/${p}`);
  for (const d of new Set(rows.map((r) => r.dealId))) if (d) revalidatePath(`/deals/${d}`);
}

/**
 * Move active tasks to `to` (null clears). `which` picks the date:
 *   "due"    the due date (staff tasks, "Move all to today");
 *   "target" what a contractor sees (D7): a Scheduled job's visit date,
 *            otherwise its due date.
 * Closed tasks, tasks deleted since the list was drawn and dates already at
 * `to` are skipped. Returns each moved date as it was, for Undo.
 */
export async function moveTaskDates(ids: string[], to: Ymd | null, which: "due" | "target", p: core.Principal): Promise<DateChange[]> {
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
      const field = which === "target" ? targetField({ status: r.status, scheduledFor: toYmd(r.scheduledFor) }) : "dueDate";
      if (field === "scheduledFor" && !value) throw new core.TaskRuleError("A scheduled job needs a visit date.");
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

/** Undo: put each date back as it was. Tasks deleted since are skipped. */
export async function restoreTaskDates(changes: DateChange[], p: core.Principal): Promise<void> {
  if (!changes.length) return;
  const ids = [...new Set(changes.map((c) => c.id))];
  const rows = await prisma.$transaction(async (tx) => {
    // Locked as they are read, in the database's id order (as moveTaskDates takes them), whatever order the Undo's
    // list came in. Held from here, a task can't be deleted between this read and its patch, which would fail the
    // whole Undo; one deleted before it isn't read, and is skipped. NO KEY UPDATE, the lock patchTask's update takes.
    const rows = await tx.$queryRaw<{ id: string; propertyId: string | null; dealId: string | null }[]>`
      SELECT "id", "propertyId", "dealId" FROM "Task" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;
    for (const r of rows) {
      for (const c of changes) {
        if (c.id !== r.id) continue;
        await core.patchTask(tx, c.id, c.field === "dueDate" ? { dueDate: c.value } : { scheduledFor: c.value }, p);
      }
    }
    return rows;
  }, TX);
  revalidate(rows);
}
