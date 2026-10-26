"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withLog } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server actions: authenticate, validate, call the task service.
 * Everything that touches the database lives in src/lib/tasks/ (service.ts
 * wraps core.ts, where the rules are). New task's create is
 * `tasks/new/actions.ts`; a task's files are `tasks/upload-actions.ts`.
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
