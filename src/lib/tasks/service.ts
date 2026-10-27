import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { Task, TaskStatus, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { firstName } from "@/lib/names";
import type { UnitRename } from "@/lib/property-types";
import { activeTask } from "@/lib/task-scope";
import { asEditorConflict } from "./conflicts";
import * as core from "./core";
import { contactsWhoSaw, deleteEmailNote, emailStatesIn } from "./delivery";

/**
 * Task domain for the app: every staff, system and public-form task write
 * goes through here. Server actions authenticate and parse, then call in.
 * The rules themselves (who may do what, timeline events, contractor access,
 * repeats, which emails go out) live in ./core, shared with the contractor
 * portal and the Asana importer. This layer adds the transaction, then
 * revalidates every page that shows the task once it commits.
 */

export type { ChecklistSnapshot, Principal, NewTaskInput, TaskPatch, StatusOptions } from "./core";
export { AssigneeChangedError, NotesChangedError, TaskChangedError, TaskRuleError, bucketFor } from "./core";
export { TEMPLATE_BUCKET };

/** The signed-in staff user as the actor on a write. */
export function staffPrincipal(user: Pick<User, "id" | "name" | "email">): core.Principal {
  return { kind: "staff", userId: user.id, label: user.name ?? user.email };
}

/** An automated writer: "Property reminder", "Move-in form". */
export function systemPrincipal(label: string): core.Principal {
  return { kind: "system", label };
}

function revalidateTask(t: { id: string; propertyId?: string | null; dealId?: string | null } | null, extraPropertyIds: (string | null | undefined)[] = []): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (!t) return;
  revalidatePath(`/tasks/${t.id}`);
  for (const p of new Set([t.propertyId, ...extraPropertyIds])) if (p) revalidatePath(`/properties/${p}`);
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
}

export async function createTask(input: core.NewTaskInput, p: core.Principal): Promise<Task> {
  const task = await prisma.$transaction((tx) => core.createTask(tx, input, p));
  revalidateTask(task);
  return task;
}

/**
 * Any status change. A refused one (the task moved on, or is gone) still
 * refreshes the pages, so the screen that sent it shows where the task is.
 */
export async function setTaskStatus(id: string, to: TaskStatus, p: core.Principal, opts: core.StatusOptions = {}): Promise<core.StatusResult> {
  try {
    const result = await prisma.$transaction((tx) => core.setStatus(tx, id, to, p, opts));
    revalidateTask(result.task);
    return result;
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id });
    throw err;
  }
}

/**
 * Field edits. A task deleted elsewhere is refused ("That task no longer
 * exists."), never a quiet success: the screen would toast "Task renamed"
 * over nothing saved. A refused one (deleted, someone reassigned it or saved
 * the notes first) still refreshes the pages, so the screen that sent it
 * shows where the task is now; a stale notes save comes back as the notes
 * field's conflict (conflicts.ts).
 */
export async function patchTask(id: string, patch: core.TaskPatch, p: core.Principal): Promise<void> {
  try {
    const { after, propertyBefore } = await prisma.$transaction(async (tx) => {
      // Read with the write, so the property page it leaves is the one it was on.
      const was = await tx.task.findUnique({ where: { id }, select: { propertyId: true } });
      return { after: await core.patchTask(tx, id, patch, p), propertyBefore: was?.propertyId ?? null };
    });
    revalidateTask(after, [propertyBefore]);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id });
    throw asEditorConflict(err);
  }
}

/**
 * A unit renamed on its property: the tasks that name it follow
 * (core.renameTaskUnits). Runs inside the property save's transaction, so
 * the units and their tasks change together; pass the ids it returns to
 * revalidateTasks once that commits.
 */
export function renameTaskUnits(tx: core.Tx, propertyId: string, renames: readonly UnitRename[], p: core.Principal): Promise<string[]> {
  return core.renameTaskUnits(tx, propertyId, renames, p);
}

/** Refresh the task lists and these tasks' pages after a write made from another page. */
export function revalidateTasks(ids: readonly string[]): void {
  if (ids.length === 0) return;
  revalidateTask(null);
  for (const id of ids) revalidatePath(`/tasks/${id}`);
}

/**
 * Staff only: removes the task for good, with its timeline, checklist,
 * files, access rows and queued emails (all cascade), then its blobs once
 * the delete has committed. A task on a deal leaves a line on the deal's
 * timeline. No-op when the task doesn't exist.
 */
export async function deleteTask(id: string, p: core.Principal): Promise<void> {
  if (p.kind !== "staff") throw new core.TaskRuleError("Only staff can delete a task.");
  const removed = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        propertyId: true,
        dealId: true,
        attachments: { select: { url: true, thumbPathname: true, posterPathname: true } },
      },
    });
    if (!task) return null;
    await tx.task.delete({ where: { id } });
    if (task.dealId) {
      await tx.dealNote.create({ data: { dealId: task.dealId, body: `Task deleted: ${task.title}  ·  ${p.label}`, noteDate: new Date(), source: "change" } });
    }
    return task;
  });
  if (!removed) return;
  // A LINK has no blob. Older rows may still point at a public blob; del() takes either URL.
  const blobs = removed.attachments.flatMap((a) => [a.url, a.thumbPathname, a.posterPathname]).filter((x): x is string => !!x);
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (blobs.length && token) {
    await del(blobs, { token }).catch((err) => logError("tasks:delete:blobs", err, { taskId: id, count: blobs.length }));
  }
  revalidateTask(removed);
}

export async function addTaskComment(taskId: string, input: core.CommentInput, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addComment(tx, taskId, input, p));
  revalidatePath(`/tasks/${taskId}`);
}

/** Save new text on your own comment (activity 2.5). Nothing is emailed: the drain re-reads each comment when it sends. */
export async function editTaskComment(eventId: string, body: string, p: core.Principal): Promise<void> {
  const ev = await prisma.$transaction((tx) => core.editComment(tx, eventId, { body }, p));
  revalidatePath(`/tasks/${ev.taskId}`);
}

/**
 * Delete your own comment, softly. Returns what the toast says about the
 * email: "Zack won't get it" while it is still queued, "Zack already got the
 * email" once it went, null for an Internal comment or one never emailed.
 */
export async function deleteTaskComment(eventId: string, p: core.Principal): Promise<{ emailNote: string | null }> {
  const out = await prisma.$transaction(async (tx) => {
    const was = await tx.taskEvent.findUnique({ where: { id: eventId }, select: { visibility: true, audienceContactId: true, taskId: true, createdAt: true } });
    // Who could have read it, settled before it comes off: a comment no contractor saw leaves no trace in the portal.
    const seenBy = was?.visibility === "SHARED" && p.kind === "staff" ? await contactsWhoSaw(tx, { id: eventId, ...was }) : undefined;
    const { taskId } = await core.deleteComment(tx, eventId, p, new Date(), seenBy);
    let emailNote: string | null = null;
    if (was?.visibility === "SHARED" && was.audienceContactId) {
      const states = await emailStatesIn(tx, taskId, was.audienceContactId, [eventId]);
      const contact = await tx.contact.findUnique({ where: { id: was.audienceContactId }, select: { fullName: true } });
      emailNote = deleteEmailNote(states.get(eventId) ?? null, firstName(contact?.fullName) || contact?.fullName || null);
    }
    return { taskId, emailNote };
  });
  revalidatePath(`/tasks/${out.taskId}`);
  return { emailNote: out.emailNote };
}

/** Undo a delete: the comment and the files that went with it come back. */
export async function restoreTaskComment(eventId: string, p: core.Principal): Promise<void> {
  const { taskId } = await prisma.$transaction((tx) => core.restoreComment(tx, eventId, p));
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Approve's Undo: back to Review as if never approved (core.undoApproval).
 * A refused one (the job moved on) still refreshes the pages, so the screen
 * shows where the job is.
 */
export async function undoTaskApproval(taskId: string, approvedEventId: string, p: core.Principal): Promise<void> {
  try {
    const { task } = await prisma.$transaction((tx) => core.undoApproval(tx, taskId, approvedEventId, p));
    revalidateTask(task);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id: taskId });
    throw err;
  }
}

export async function setChecklistItem(itemId: string, done: boolean, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.setChecklistItem(tx, itemId, done, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

export async function addChecklistItem(taskId: string, title: string, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addChecklistItem(tx, taskId, title, p));
  revalidatePath(`/tasks/${taskId}`);
}

/** Rename an item (forms 4.4). Staff only. */
export async function renameChecklistItem(itemId: string, title: string, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.renameChecklistItem(tx, itemId, title, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

/** Remove an item. Returns the snapshot the Undo toast passes to `restoreChecklistItem`. */
export async function removeChecklistItem(itemId: string, p: core.Principal): Promise<core.ChecklistSnapshot> {
  const snapshot = await prisma.$transaction((tx) => core.removeChecklistItem(tx, itemId, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
  return snapshot;
}

/** Undo a removal: the item comes back with its id, place and tick. */
export async function restoreChecklistItem(snapshot: core.ChecklistSnapshot, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.restoreChecklistItem(tx, snapshot, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
}

/* ---------------- Auto (system) tasks ---------------- */

/**
 * Idempotent reminder task keyed on `Task.autoKey`. Re-running only rewrites
 * the title + due date — never status or assignee — so a completed or
 * reassigned reminder is left alone. Used by the property key-date sync.
 * (The rest of the reminder fix, rolling a done reminder to next year, is
 * week 2 in docs/asana-migration-plan.md.)
 */
export async function upsertAutoTask(autoKey: string, propertyId: string, title: string, dueDate: Date): Promise<void> {
  const existing = await prisma.task.findUnique({ where: { autoKey }, select: { id: true } });
  if (existing) {
    await prisma.task.update({ where: { autoKey }, data: { title, dueDate } });
    return;
  }
  await prisma.$transaction((tx) =>
    core.createTask(tx, { title, dueDate: dueDate.toISOString().slice(0, 10), propertyId, autoKey }, systemPrincipal("Property reminder")),
  );
}

/**
 * The key date an auto task tracked was cleared: cancel it if it's still open
 * (never delete; its history stays). Clearing autoKey lets a later date
 * create a fresh reminder instead of reviving this one.
 */
export async function cancelOpenAutoTask(autoKey: string): Promise<void> {
  await prisma.task.updateMany({
    where: { autoKey, ...activeTask },
    data: { status: "CANCELED", autoKey: null, completedAt: new Date() },
  });
}


/* ---------------- Attachments (files in Vercel Blob) ---------------- */

// Moved to ./attachments (docs/specs/build-plan.md 1.3); every importer keeps this path.
export {
  contractorUploadRefusal,
  deleteTaskAttachment,
  recordPortalAttachment,
  recordTaskAttachment,
  renameTaskAttachment,
  type UploadedFile,
} from "./attachments";
