import "server-only";
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
 * Closed tasks and dates already at `to` are skipped. Returns each moved
 * date as it was, for Undo.
 */
export async function moveTaskDates(ids: string[], to: Ymd | null, which: "due" | "target", p: core.Principal): Promise<DateChange[]> {
  const value = to === null ? null : toYmd(to);
  if (to !== null && !value) throw new core.TaskRuleError("That isn't a date.");
  const { moved, rows } = await prisma.$transaction(async (tx) => {
    const rows = await tx.task.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, status: true, dueDate: true, scheduledFor: true, propertyId: true, dealId: true },
    });
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
  const rows = await prisma.$transaction(async (tx) => {
    const rows = await tx.task.findMany({
      where: { id: { in: [...new Set(changes.map((c) => c.id))] } },
      select: { id: true, propertyId: true, dealId: true },
    });
    const exists = new Set(rows.map((r) => r.id));
    for (const c of changes) {
      if (!exists.has(c.id)) continue;
      await core.patchTask(tx, c.id, c.field === "dueDate" ? { dueDate: c.value } : { scheduledFor: c.value }, p);
    }
    return rows;
  }, TX);
  revalidate(rows);
}
