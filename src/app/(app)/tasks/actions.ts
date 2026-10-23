"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withLog, withResult } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the task service, redirect.
 * Everything that touches the database lives in src/lib/tasks/ (service.ts
 * wraps core.ts, where the rules are).
 */

export async function toggleTask(id: string) {
  return withLog("toggleTask", async () => {
    const user = await requireUser();
    await tasks.toggleTask(z.string().min(1).parse(id), tasks.staffPrincipal(user));
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
    const task = await tasks.createTask(
      {
        title: p.title,
        description: p.description,
        dueDate: p.dueDate,
        priority: p.priority,
        propertyId: p.propertyId,
        dealId: p.dealId,
        assignee: p.assigneeUserId ? { userId: p.assigneeUserId } : null,
        assigneeName: p.assigneeUserId ? null : p.assigneeName,
      },
      tasks.staffPrincipal(user),
    );
    redirect(`/tasks/${task.id}`);
  });
}

// The inline editors on the task list and detail page send one field at a time.
const patchSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
    assigneeUserId: z.string().nullable(),
    dueDate: z.string().nullable(),
    propertyId: z.string().nullable(),
  })
  .partial()
  .strict();

/** Inline single-field edits from the task list and detail page. */
export async function patchTask(id: string, data: z.input<typeof patchSchema>) {
  return withLog("patchTask", async () => {
    const user = await requireUser();
    const d = patchSchema.parse(data);
    await tasks.patchTask(
      z.string().min(1).parse(id),
      {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.dueDate !== undefined ? { dueDate: d.dueDate || null } : {}),
        ...(d.propertyId !== undefined ? { propertyId: d.propertyId || null } : {}),
        ...(d.assigneeUserId !== undefined ? { assignee: d.assigneeUserId ? { userId: d.assigneeUserId } : null } : {}),
      },
      tasks.staffPrincipal(user),
    );
  });
}

/* ---------------- Attachments (files in Vercel Blob) ---------------- */

// Where the browser put the file and what to call it. Never its URL, size or
// type: the service reads those from Blob itself. Shared unless the composer
// says Internal (D15).
const uploadedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    width: z.number().int().positive().max(20000).nullish(),
    height: z.number().int().positive().max(20000).nullish(),
    durationSec: z.number().positive().max(24 * 3600).nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
    visibility: z.enum(["SHARED", "INTERNAL"]).default("SHARED"),
  })
  .strict();

/** After the browser finished uploading straight to Blob. Returns a message instead of throwing, for the uploader to show. */
export async function recordTaskAttachment(taskId: string, data: z.input<typeof uploadedSchema>): Promise<ActionResult> {
  return withResult("recordTaskAttachment", async () => {
    const user = await requireUser();
    const { visibility, ...file } = uploadedSchema.parse(data);
    await tasks.recordTaskAttachment(z.string().min(1).parse(taskId), file, tasks.staffPrincipal(user), { visibility });
  });
}

export async function deleteTaskAttachment(attachmentId: string) {
  return withLog("deleteTaskAttachment", async () => {
    await requireUser();
    await tasks.deleteTaskAttachment(z.string().min(1).parse(attachmentId));
  });
}
