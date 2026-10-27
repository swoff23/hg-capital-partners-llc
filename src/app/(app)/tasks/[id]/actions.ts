"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withLog, withResult } from "@/lib/server-action";
import { repeatRuleSchema } from "@/lib/tasks/repeat";
import * as tasks from "@/lib/tasks/service";

/**
 * The task page's writes. Authenticate, validate, call the task service;
 * the rules (events, contractor access, emails, repeats) live in
 * src/lib/tasks/core.ts. Each returns a result the page shows inline or in a
 * toast instead of throwing to the error page.
 */

const id = z.string().min(1);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const assignee = z.union([z.object({ userId: id }).strict(), z.object({ contactId: id }).strict(), z.null()]);

const patchSchema = z
  .object({
    title: z.string().max(300),
    description: z.string().max(20_000).nullable(),
    dueDate: ymd.nullable(),
    scheduledFor: ymd.nullable(),
    propertyId: id.nullable(),
    unitLabel: z.string().max(100).nullable(),
    assignee,
    // The assignee the page showed: a reassignment from a stale page is refused.
    expectedAssignee: assignee,
    waitingOn: z.string().max(300).nullable(),
    repeatRule: repeatRuleSchema.nullable(),
  })
  .partial()
  .strict();

export async function updateTask(taskId: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  return withResult("updateTask", async () => {
    const user = await requireUser();
    await tasks.patchTask(id.parse(taskId), patchSchema.parse(patch), tasks.staffPrincipal(user));
  });
}

const statusSchema = z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED"]);
const statusOptsSchema = z
  .object({
    waitingOn: z.string().max(300).nullable(),
    scheduledFor: ymd.nullable(),
    // Send back's note: 2,000 characters, the same on the banner, Today's rows and both servers (forms 4.4).
    note: z.string().max(2000).nullable(),
    // The status the page showed: a change from a stale page is refused.
    expected: statusSchema,
  })
  .partial()
  .strict();

/** Any status, by staff (D6c). Waiting needs a reason, Scheduled a visit date; Send back carries a shared note. */
export async function setTaskStatus(
  taskId: string,
  to: z.input<typeof statusSchema>,
  opts: z.input<typeof statusOptsSchema> = {},
): Promise<ActionResult> {
  return withResult("setTaskStatus", async () => {
    const user = await requireUser();
    await tasks.setTaskStatus(id.parse(taskId), statusSchema.parse(to), tasks.staffPrincipal(user), statusOptsSchema.parse(opts));
  });
}

const commentSchema = z
  .object({
    body: z.string().max(20_000),
    visibility: z.enum(["SHARED", "INTERNAL"]),
    attachmentIds: z.array(id).max(50).default([]),
    // Made in the browser per send, so a Retry that follows a post that did land writes nothing twice.
    clientId: z.string().min(1).max(100).optional(),
  })
  .strict();

export async function addTaskComment(taskId: string, input: z.input<typeof commentSchema>): Promise<ActionResult> {
  return withResult("addTaskComment", async () => {
    const user = await requireUser();
    await tasks.addTaskComment(id.parse(taskId), commentSchema.parse(input), tasks.staffPrincipal(user));
  });
}

/** New text on your own comment (activity 2.5). Nothing is emailed; an email still waiting sends the edited text. */
export async function editTaskComment(eventId: string, body: string): Promise<ActionResult> {
  return withResult("editTaskComment", async () => {
    const user = await requireUser();
    await tasks.editTaskComment(id.parse(eventId), z.string().max(20_000).parse(body), tasks.staffPrincipal(user));
  });
}

/** Delete your own comment. The result names what the toast says about the email. */
export async function deleteTaskComment(eventId: string): Promise<ActionResult<{ emailNote: string | null }>> {
  return withResult("deleteTaskComment", async () => {
    const user = await requireUser();
    return tasks.deleteTaskComment(id.parse(eventId), tasks.staffPrincipal(user));
  });
}

/** The delete toast's Undo. */
export async function restoreTaskComment(eventId: string): Promise<ActionResult> {
  return withResult("restoreTaskComment", async () => {
    const user = await requireUser();
    await tasks.restoreTaskComment(id.parse(eventId), tasks.staffPrincipal(user));
  });
}

export async function setChecklistItem(itemId: string, done: boolean): Promise<ActionResult> {
  return withResult("setChecklistItem", async () => {
    const user = await requireUser();
    await tasks.setChecklistItem(id.parse(itemId), z.boolean().parse(done), tasks.staffPrincipal(user));
  });
}

export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult> {
  return withResult("addChecklistItem", async () => {
    const user = await requireUser();
    await tasks.addChecklistItem(id.parse(taskId), z.string().trim().min(1).max(300).parse(title), tasks.staffPrincipal(user));
  });
}

/** A photo, video or file, gone for good (staff only). */
export async function deleteTaskFile(attachmentId: string): Promise<ActionResult> {
  return withResult("deleteTaskFile", async () => {
    await requireUser();
    await tasks.deleteTaskAttachment(id.parse(attachmentId));
  });
}

/** Gone for good, files and all; then back to the task list. */
export async function deleteTask(taskId: string): Promise<void> {
  return withLog("deleteTask", async () => {
    const user = await requireUser();
    await tasks.deleteTask(id.parse(taskId), tasks.staffPrincipal(user));
    redirect("/tasks");
  });
}
