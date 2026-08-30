"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { parseAttachments, normalizeAttachmentUrl } from "@/lib/task-types";
import { logDealTaskEvent } from "../deals/actions";

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
      dueDate: p.dueDate ? new Date(p.dueDate) : null,
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
    patch.assigneeUserId = data.assigneeUserId || null;
    if (data.assigneeUserId) patch.assigneeName = null;
  }
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;
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

/* ---------------- Attachments (link-style, stored on Task.links) ---------------- */

export async function addTaskAttachment(id: string, formData: FormData) {
  await requireUser();
  const rawUrl = formData.get("url")?.toString().trim();
  if (!rawUrl) return;
  const url = normalizeAttachmentUrl(rawUrl);
  const title = formData.get("title")?.toString().trim() || url;

  const task = await prisma.task.findUnique({ where: { id }, select: { links: true } });
  if (!task) return;

  const next = [...parseAttachments(task.links), { url, title }];
  await prisma.task.update({ where: { id }, data: { links: next } });
  revalidatePath(`/tasks/${id}`);
}

export async function removeTaskAttachment(id: string, index: number) {
  await requireUser();
  const task = await prisma.task.findUnique({ where: { id }, select: { links: true } });
  if (!task) return;

  const list = parseAttachments(task.links);
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  await prisma.task.update({ where: { id }, data: { links: list } });
  revalidatePath(`/tasks/${id}`);
}
