import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { Task, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ymdToDate } from "@/lib/dates";
import { logDealTaskEvent } from "@/lib/deals/log";
import { TEMPLATE_BUCKET } from "@/lib/config";

/**
 * Task domain: every write to Task / TaskAttachment goes through here.
 * Server actions (src/app/(app)/tasks/actions.ts) authenticate and parse,
 * then call in; the public move-in form and the property key-date reminders
 * call in too. Business rules live here, not in the actions:
 *   - a task with a property sits in the "Property" bucket, otherwise "General"
 *   - completing / adding a task against a deal writes to the deal's timeline
 *   - choosing a user as assignee clears any free-text external assignee
 *
 * Revalidation: each write ends with `revalidateTask`, which covers every
 * page that renders the task — list, detail, dashboard, and the property
 * page(s) it is or was attached to.
 */

export interface Actor {
  name: string | null;
  email: string;
}

const actorLabel = (a: Actor) => a.name ?? a.email;

function revalidateTask(id: string | null, propertyIds: (string | null | undefined)[] = []): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (id) revalidatePath(`/tasks/${id}`);
  for (const p of new Set(propertyIds)) if (p) revalidatePath(`/properties/${p}`);
}

export function bucketFor(propertyId: string | null | undefined): string {
  return propertyId ? "Property" : "General";
}

export interface NewTask {
  title: string;
  description?: string | null;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  /** "YYYY-MM-DD" */
  dueDate?: string | null;
  priority?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  status?: TaskStatus;
}

/** Create a task. `actor` is who did it (for the deal timeline); null for system/public writes. */
export async function createTask(input: NewTask, actor: Actor | null): Promise<Task> {
  const propertyId = input.propertyId || null;
  const task = await prisma.task.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigneeUserId: input.assigneeUserId || null,
      assigneeName: input.assigneeName?.trim() || null,
      dueDate: ymdToDate(input.dueDate),
      priority: input.priority || null,
      propertyId,
      dealId: input.dealId || null,
      bucket: bucketFor(propertyId),
      status: input.status ?? "OPEN",
    },
  });
  if (task.dealId && actor) await logDealTaskEvent(task.dealId, actorLabel(actor), `Task added: ${task.title}`);
  revalidateTask(task.id, [propertyId]);
  return task;
}

/** Flip OPEN <-> DONE. No-op when the task doesn't exist. */
export async function toggleTask(id: string, actor: Actor): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return;
  const done = t.status === "OPEN";
  await prisma.task.update({
    where: { id },
    data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null },
  });
  if (t.dealId) {
    await logDealTaskEvent(t.dealId, actorLabel(actor), `Task ${done ? "completed" : "reopened"}: ${t.title}`);
  }
  revalidateTask(id, [t.propertyId]);
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  assigneeUserId?: string | null;
  /** "YYYY-MM-DD" or null to clear */
  dueDate?: string | null;
  propertyId?: string | null;
}

/**
 * Inline single-field edits. Only keys actually present are written;
 * `null`/`""` clears a field. A title shorter than 2 chars is ignored.
 */
export async function patchTask(id: string, data: TaskPatch): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id }, select: { propertyId: true } });
  if (!task) return;

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) {
    const v = data.title.trim();
    if (v.length >= 2) patch.title = v;
  }
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  if (data.assigneeUserId !== undefined) {
    // Setting a user (or unassigning) always supersedes any free-text external name.
    patch.assigneeUserId = data.assigneeUserId || null;
    patch.assigneeName = null;
  }
  if (data.dueDate !== undefined) patch.dueDate = ymdToDate(data.dueDate);
  if (data.propertyId !== undefined) {
    patch.propertyId = data.propertyId || null;
    patch.bucket = bucketFor(data.propertyId);
  }
  if (Object.keys(patch).length === 0) return;

  await prisma.task.update({ where: { id }, data: patch });
  revalidateTask(id, [task.propertyId, typeof patch.propertyId === "string" ? patch.propertyId : null]);
}

/* ---------------- Auto (system) tasks ---------------- */

/**
 * Idempotent reminder task keyed on `Task.autoKey`. Re-running only rewrites
 * the title + due date — never status or assignee — so a completed or
 * reassigned reminder is left alone. Used by the property key-date sync.
 */
export async function upsertAutoTask(autoKey: string, propertyId: string, title: string, dueDate: Date): Promise<void> {
  await prisma.task.upsert({
    where: { autoKey },
    create: { autoKey, title, dueDate, propertyId, bucket: bucketFor(propertyId) },
    update: { title, dueDate },
  });
}

/** Drop a still-open auto task (the key date it tracked was cleared). */
export async function deleteOpenAutoTask(autoKey: string): Promise<void> {
  await prisma.task.deleteMany({ where: { autoKey, status: "OPEN" } });
}

export { TEMPLATE_BUCKET };

/* ---------------- Attachments (files in Vercel Blob) ---------------- */

export interface AttachmentInput {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
}

/** Called after the browser finished uploading straight to Blob. */
export async function recordTaskAttachment(taskId: string, data: AttachmentInput): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return;
  await prisma.taskAttachment.create({
    data: {
      taskId,
      url: data.url,
      pathname: data.pathname,
      filename: data.filename.slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(data.size)),
      contentType: data.contentType,
    },
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  try {
    await del(att.url);
  } catch {
    // Blob already gone / token missing — still drop the DB row.
  }
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/tasks/${att.taskId}`);
}
