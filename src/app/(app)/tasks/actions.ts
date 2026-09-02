"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withLog } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the task service, redirect.
 * Everything that touches the database lives in src/lib/tasks/service.ts.
 */

export async function toggleTask(id: string) {
  return withLog("toggleTask", async () => {
    const user = await requireUser();
    await tasks.toggleTask(id, user);
  });
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
  return withLog("createTask", async () => {
    const user = await requireUser();
    const p = taskSchema.parse(formToObject(formData));
    const task = await tasks.createTask(p, user);
    redirect(`/tasks/${task.id}`);
  });
}

/** Inline single-field edits from the task list and detail page. */
export async function patchTask(id: string, data: tasks.TaskPatch) {
  return withLog("patchTask", async () => {
    await requireUser();
    await tasks.patchTask(id, data);
  });
}

/* ---------------- Attachments (files in Vercel Blob) ---------------- */

export async function recordTaskAttachment(taskId: string, data: tasks.AttachmentInput) {
  return withLog("recordTaskAttachment", async () => {
    await requireUser();
    await tasks.recordTaskAttachment(taskId, data);
  });
}

export async function deleteTaskAttachment(attachmentId: string) {
  return withLog("deleteTaskAttachment", async () => {
    await requireUser();
    await tasks.deleteTaskAttachment(attachmentId);
  });
}
