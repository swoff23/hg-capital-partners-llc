import type { TaskChecklistItem } from "@prisma/client";
import { addEvent, TaskRuleError, type Principal, type Tx } from "./core";

/**
 * Renaming and removing a checklist item, and taking a removal back (forms
 * 4.4, BTASKS-024). Ticking and adding live in core.ts; these are the other
 * edits to a task's checklist, so an item can be fixed or dropped without
 * touching the task's other rows.
 *
 * Each write adds a CHECKLIST event whose `data` says what happened, for the
 * Activity line: `{ action: "renamed" | "removed" | "restored", from, to }`,
 * with the item's id and its current title beside them. Removing deletes the
 * row, so it hands back a snapshot of it, which the Undo toast passes to
 * `restoreChecklistItem`: the same id, place, tick and who ticked it, so a
 * restored item is the one that was removed. Staff only, like Add item.
 *
 * Deliberately no `server-only` and no network, like core.ts: the pieces are
 * tested on a fake transaction (checklist.test.ts), and checklist-service.ts
 * revalidates after the commit.
 */

const MAX_TITLE = 300;

/** What a removal hands back, as plain JSON, so Undo can put the row back exactly. */
export type ChecklistSnapshot = {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  /** An ISO instant, or null while it isn't ticked. */
  doneAt: string | null;
  doneByUserId: string | null;
  doneByContactId: string | null;
  assigneeLabel: string | null;
  position: number;
};

/** The edits that write an event name them; the Activity line reads `action`. */
export type ChecklistAction = "renamed" | "removed" | "restored";

const editStamp = (p: Principal, now: Date) => (p.kind === "staff" ? { appEditedAt: now } : {});

function staffOnly(p: Principal): void {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't change checklist items yet.");
}

async function record(
  tx: Tx,
  taskId: string,
  p: Principal,
  action: ChecklistAction,
  item: { id: string; title: string },
  change: { from: string | null; to: string | null },
  now: Date,
): Promise<void> {
  await addEvent(tx, taskId, p, {
    kind: "CHECKLIST",
    data: { action, itemId: item.id, title: item.title, from: change.from, to: change.to },
  });
  // Stamped like every other edit, so a repeat copy someone changed counts as touched.
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
}

/** The title an edit saves: trimmed to one line of text, never empty, no longer than Add item allows. */
export function checklistTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) throw new TaskRuleError("Enter a name for the item.");
  if (t.length > MAX_TITLE) throw new TaskRuleError(`Use ${MAX_TITLE} characters or fewer.`);
  return t;
}

/** Rename an item. The same title (once tidied) writes nothing and adds no line to Activity. */
export async function renameChecklistItem(tx: Tx, itemId: string, title: string, p: Principal, now = new Date()): Promise<TaskChecklistItem> {
  staffOnly(p);
  const next = checklistTitle(title);
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  if (item.title === next) return item;
  const updated = await tx.taskChecklistItem.update({ where: { id: itemId }, data: { title: next } });
  await record(tx, item.taskId, p, "renamed", { id: itemId, title: next }, { from: item.title, to: next }, now);
  return updated;
}

/** Remove an item. Returns the snapshot Undo needs. An item already gone is a rule error: the checklist moved on. */
export async function removeChecklistItem(tx: Tx, itemId: string, p: Principal, now = new Date()): Promise<ChecklistSnapshot> {
  staffOnly(p);
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  await tx.taskChecklistItem.delete({ where: { id: itemId } });
  await record(tx, item.taskId, p, "removed", { id: itemId, title: item.title }, { from: item.title, to: null }, now);
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    done: item.done,
    doneAt: item.doneAt ? item.doneAt.toISOString() : null,
    doneByUserId: item.doneByUserId,
    doneByContactId: item.doneByContactId,
    assigneeLabel: item.assigneeLabel,
    position: item.position,
  };
}

/**
 * Undo a removal: the item comes back with its id, place and tick. An item
 * that is already back (a second Undo, or another tab) is left as it is; a
 * task that is gone can't take it.
 */
export async function restoreChecklistItem(tx: Tx, snapshot: ChecklistSnapshot, p: Principal, now = new Date()): Promise<void> {
  staffOnly(p);
  const existing = await tx.taskChecklistItem.findUnique({ where: { id: snapshot.id } });
  if (existing) return;
  const task = await tx.task.findUnique({ where: { id: snapshot.taskId }, select: { id: true } });
  if (!task) throw new TaskRuleError("This task is gone, so the item can't come back.");
  await tx.taskChecklistItem.create({
    data: {
      id: snapshot.id,
      taskId: snapshot.taskId,
      title: snapshot.title,
      done: snapshot.done,
      doneAt: snapshot.doneAt ? new Date(snapshot.doneAt) : null,
      doneByUserId: snapshot.doneByUserId,
      doneByContactId: snapshot.doneByContactId,
      assigneeLabel: snapshot.assigneeLabel,
      position: snapshot.position,
    },
  });
  await record(tx, snapshot.taskId, p, "restored", { id: snapshot.id, title: snapshot.title }, { from: null, to: snapshot.title }, now);
}
