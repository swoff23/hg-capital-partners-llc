import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { removeChecklistItem, renameChecklistItem, restoreChecklistItem, type ChecklistSnapshot } from "./checklist";
import type { Principal } from "./core";

/**
 * The task page's checklist edits (forms 4.4): rename, remove, and put a
 * removal back. The rules and the Activity lines are in checklist.ts; this
 * runs them in a transaction and refreshes the task page after the commit.
 */

export async function renameItem(itemId: string, title: string, p: Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => renameChecklistItem(tx, itemId, title, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

/** Returns the snapshot the Undo toast passes to `restoreItem`. */
export async function removeItem(itemId: string, p: Principal): Promise<ChecklistSnapshot> {
  const snapshot = await prisma.$transaction((tx) => removeChecklistItem(tx, itemId, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
  return snapshot;
}

export async function restoreItem(snapshot: ChecklistSnapshot, p: Principal): Promise<void> {
  await prisma.$transaction((tx) => restoreChecklistItem(tx, snapshot, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
}
