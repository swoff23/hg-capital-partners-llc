import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { Task, TaskStatus, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { activeTask } from "@/lib/task-scope";
import * as core from "./core";

/**
 * Task domain for the app: every staff, system and public-form task write
 * goes through here. Server actions authenticate and parse, then call in.
 * The rules themselves (who may do what, timeline events, contractor access,
 * repeats, which emails go out) live in ./core, shared with the contractor
 * portal and the Asana importer. This layer adds the transaction, then
 * revalidates every page that shows the task once it commits.
 */

export type { Principal, NewTaskInput, TaskPatch, StatusOptions } from "./core";
export { TaskRuleError, bucketFor } from "./core";
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

export async function setTaskStatus(id: string, to: TaskStatus, p: core.Principal, opts: core.StatusOptions = {}): Promise<core.StatusResult> {
  const result = await prisma.$transaction((tx) => core.setStatus(tx, id, to, p, opts));
  revalidateTask(result.task);
  return result;
}

/** The checkbox. No-op when the task doesn't exist. */
export async function toggleTask(id: string, p: core.Principal): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!t) return;
  const result = await prisma.$transaction((tx) => core.toggleDone(tx, t, p));
  revalidateTask(result.task);
}

/** Field edits. No-op when the task doesn't exist. */
export async function patchTask(id: string, patch: core.TaskPatch, p: core.Principal): Promise<void> {
  const before = await prisma.task.findUnique({ where: { id }, select: { propertyId: true } });
  if (!before) return;
  const after = await prisma.$transaction((tx) => core.patchTask(tx, id, patch, p));
  revalidateTask(after, [before.propertyId]);
}

export async function addTaskComment(taskId: string, input: core.CommentInput, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addComment(tx, taskId, input, p));
  revalidatePath(`/tasks/${taskId}`);
}

export async function setChecklistItem(itemId: string, done: boolean, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.setChecklistItem(tx, itemId, done, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

export async function addChecklistItem(taskId: string, title: string, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addChecklistItem(tx, taskId, title, p));
  revalidatePath(`/tasks/${taskId}`);
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

export interface AttachmentInput {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
}

/** Called after the browser finished uploading straight to Blob. */
export async function recordTaskAttachment(taskId: string, data: AttachmentInput, p: core.Principal): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return;
  await prisma.$transaction((tx) => core.recordAttachment(tx, taskId, data, p, { visibility: "SHARED" }));
  revalidatePath(`/tasks/${taskId}`);
}

/** Staff only: removes the row and the blob for good. */
export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  try {
    for (const p of [att.url, att.thumbPathname, att.posterPathname]) if (p) await del(p);
  } catch {
    // Blob already gone / token missing — still drop the DB row.
  }
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/tasks/${att.taskId}`);
}
