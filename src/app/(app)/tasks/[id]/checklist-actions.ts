"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";
import { checklistSnapshotSchema } from "@/lib/tasks/checklist-snapshot";
import type { ChecklistSnapshot } from "@/lib/tasks/service";

/**
 * Rename, remove and un-remove a checklist item (forms 4.4). Authenticate,
 * validate, call the task service; the rules and the Activity events live in
 * src/lib/tasks/core.ts beside ticking and adding. Ticking and adding are in actions.ts.
 */

const id = z.string().min(1).max(100);

export async function renameChecklistItem(itemId: string, title: string): Promise<ActionResult> {
  return withResult("renameChecklistItem", async () => {
    const user = await requireUser();
    await tasks.renameChecklistItem(id.parse(itemId), z.string().max(2000).parse(title), tasks.staffPrincipal(user));
  });
}

/** Removes the item and hands back what Undo needs to bring it back. */
export async function removeChecklistItem(itemId: string): Promise<ActionResult<ChecklistSnapshot>> {
  return withResult("removeChecklistItem", async () => {
    const user = await requireUser();
    return tasks.removeChecklistItem(id.parse(itemId), tasks.staffPrincipal(user));
  });
}

/** Undo for a removal: the item comes back as it was, with its tick. */
export async function restoreChecklistItem(snapshot: ChecklistSnapshot): Promise<ActionResult> {
  return withResult("restoreChecklistItem", async () => {
    const user = await requireUser();
    await tasks.restoreChecklistItem(checklistSnapshotSchema.parse(snapshot), tasks.staffPrincipal(user));
  });
}
