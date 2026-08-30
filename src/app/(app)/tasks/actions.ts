"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";

export async function toggleTask(id: string) {
  await requireUser();
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return;
  const done = t.status === "OPEN";
  await prisma.task.update({
    where: { id },
    data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null },
  });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
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
  await requireUser();
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
  revalidatePath("/tasks");
  if (p.propertyId) revalidatePath(`/properties/${p.propertyId}`);
  if (p.dealId) revalidatePath(`/deals/${p.dealId}`);
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(id: string, formData: FormData) {
  await requireUser();
  const str = (k: string) => (formData.get(k)?.toString().trim() || null);
  const data: Record<string, unknown> = {};
  if (formData.has("title") && str("title")) data.title = str("title");
  if (formData.has("description")) data.description = str("description");
  if (formData.has("assigneeUserId")) {
    data.assigneeUserId = str("assigneeUserId");
    if (str("assigneeUserId")) data.assigneeName = null;
  }
  if (formData.has("assigneeName") && str("assigneeName")) data.assigneeName = str("assigneeName");
  if (formData.has("dueDate")) {
    const d = str("dueDate");
    data.dueDate = d ? new Date(d) : null;
  }
  if (formData.has("propertyId")) data.propertyId = str("propertyId");

  await prisma.task.update({ where: { id }, data });
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}
