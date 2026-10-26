"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withLog, withResult } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the task service.
 * Everything that touches the database lives in src/lib/tasks/ (service.ts
 * wraps core.ts, where the rules are). New task's create is
 * `tasks/new/actions.ts`.
 */

// The inline editors on the task list and detail page send one field at a time.
// No assignee here: reassigning goes through the task page's updateTask, which
// sends the assignee the page showed so a stale screen can't take a job off a
// contractor (core.ts AssigneeChangedError).
const patchSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
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
