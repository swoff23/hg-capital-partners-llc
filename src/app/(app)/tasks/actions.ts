"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withLog, withResult } from "@/lib/server-action";
import type { Assignee } from "@/lib/tasks/core";
import { repeatRuleSchema } from "@/lib/tasks/repeat";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the task service, redirect.
 * Everything that touches the database lives in src/lib/tasks/ (service.ts
 * wraps core.ts, where the rules are).
 */

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  // The assignee picker: "u:<userId>", "c:<contactId>", or blank for nobody.
  assignee: z.string().optional(),
  assigneeUserId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
  propertyId: z.string().optional(),
  dealId: z.string().optional(),
  status: z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"]).optional(),
  waitingOn: z.string().optional(),
  scheduledFor: z.string().optional(),
  // JSON from the Repeats editor; blank for Never.
  repeatRule: z.string().optional(),
});

function pickedAssignee(v: string | undefined, legacyUserId: string | undefined): Assignee {
  if (v?.startsWith("u:") && v.length > 2) return { userId: v.slice(2) };
  if (v?.startsWith("c:") && v.length > 2) return { contactId: v.slice(2) };
  if (v === undefined && legacyUserId) return { userId: legacyUserId };
  return null;
}

export async function createTask(formData: FormData) {
  return withLog("createTask", async () => {
    const user = await requireUser();
    const p = taskSchema.parse(formToObject(formData));
    const assignee = pickedAssignee(p.assignee, p.assigneeUserId);
    if (p.status === "SCHEDULED" && !p.scheduledFor) throw new tasks.TaskRuleError("Pick the visit date.");
    const task = await tasks.createTask(
      {
        title: p.title,
        description: p.description,
        dueDate: p.dueDate,
        priority: p.priority,
        propertyId: p.propertyId,
        dealId: p.dealId,
        assignee,
        assigneeName: assignee ? null : p.assigneeName,
        status: p.status,
        waitingOn: p.waitingOn,
        scheduledFor: p.status === "SCHEDULED" ? p.scheduledFor : null,
        repeatRule: p.repeatRule ? repeatRuleSchema.parse(JSON.parse(p.repeatRule)) : null,
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
    // false: the file goes out with a comment (the composer links it on Send), so no timeline line of its own.
    standalone: z.boolean().default(true),
  })
  .strict();

/**
 * After the browser finished uploading straight to Blob. Returns the new
 * attachment's id, or a message instead of throwing, for the uploader to show.
 */
export async function recordTaskAttachment(taskId: string, data: z.input<typeof uploadedSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("recordTaskAttachment", async () => {
    const user = await requireUser();
    const { visibility, standalone, ...file } = uploadedSchema.parse(data);
    return tasks.recordTaskAttachment(z.string().min(1).parse(taskId), file, tasks.staffPrincipal(user), { visibility, standalone });
  });
}
