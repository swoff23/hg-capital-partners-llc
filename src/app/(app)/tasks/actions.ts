"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { del } from "@vercel/blob";
import { formToObject } from "@/lib/forms";
import { logDealTaskEvent } from "@/lib/deal-log";
import { ymdToDate } from "@/lib/dates";

export async function toggleTask(id: string) {
  const user = await requireUser();
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return;
  const done = t.status === "OPEN";
  await prisma.task.update({
    where: { id },
    data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null },
  });
  if (t.dealId) {
    await logDealTaskEvent(
      t.dealId,
      user.name ?? user.email,
      `Task ${done ? "completed" : "reopened"}: ${t.title}`,
    );
  }
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  if (t.propertyId) revalidatePath(`/properties/${t.propertyId}`);
  revalidatePath("/");
}

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  assigneeUserId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
  propertyId: z.string().optional(),
  dealId: z.string().optional(),
});

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const p = taskSchema.parse(formToObject(formData));
  const task = await prisma.task.create({
    data: {
      title: p.title.trim(),
      description: p.description ?? null,
      assigneeUserId: p.assigneeUserId ?? null,
      assigneeName: p.assigneeName ?? null,
      dueDate: ymdToDate(p.dueDate),
      priority: p.priority ?? null,
      propertyId: p.propertyId ?? null,
      dealId: p.dealId ?? null,
      bucket: p.propertyId ? "Property" : "General",
    },
  });
  if (p.dealId) await logDealTaskEvent(p.dealId, user.name ?? user.email, `Task added: ${task.title}`);
  revalidatePath("/tasks");
  if (p.propertyId) revalidatePath(`/properties/${p.propertyId}`);
  redirect(`/tasks/${task.id}`);
}

/**
 * Inline single-field edits from the Asana-style task detail page. Each key is
 * optional; only keys actually present are written. `null`/`""` clears a field.
 */
export async function patchTask(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    assigneeUserId: string | null;
    dueDate: string | null;
    propertyId: string | null;
  }>,
) {
  await requireUser();
  const task = await prisma.task.findUnique({
    where: { id },
    select: { propertyId: true },
  });
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
    patch.bucket = data.propertyId ? "Property" : "General";
  }
  if (Object.keys(patch).length === 0) return;

  await prisma.task.update({ where: { id }, data: patch });

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
  revalidatePath("/");
  if (task.propertyId) revalidatePath(`/properties/${task.propertyId}`);
  if (typeof patch.propertyId === "string") revalidatePath(`/properties/${patch.propertyId}`);
}

/* ---------------- Attachments (files in Vercel Blob) ---------------- */

/** Called by the client after a file finishes uploading to Blob. */
export async function recordTaskAttachment(
  taskId: string,
  data: { url: string; pathname: string; filename: string; size: number; contentType: string | null },
) {
  await requireUser();
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

export async function deleteTaskAttachment(attachmentId: string) {
  await requireUser();
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
