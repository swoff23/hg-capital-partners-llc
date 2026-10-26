"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withResult } from "@/lib/server-action";
import type { Assignee } from "@/lib/tasks/core";
import { repeatRuleSchema } from "@/lib/tasks/repeat";
import * as tasks from "@/lib/tasks/service";

/**
 * Thin server action for New task (forms 2.12, 4.4): authenticate, validate,
 * call the task service, and answer with `{ id }` instead of redirecting, so
 * the sheet decides whether to stay where you were or open the task. The
 * form posts the same field names the page form always did: `assignee`
 * ("u:<id>", "c:<id>" or blank), `dueDate`, `repeatRule` (JSON), `status`,
 * `waitingOn`, `scheduledFor`, and now `unitLabel`. A refusal comes back as a
 * value (`withResult`): a zod failure puts its plain message on the field
 * that caused it, and nothing typed is lost.
 */

const taskSchema = z.object({
  title: z.string({ error: "Enter a title." }).trim().min(2, "Enter at least 2 characters."),
  description: z.string().optional(),
  // The assignee picker: "u:<userId>", "c:<contactId>", or blank for nobody.
  assignee: z.string().optional(),
  assigneeUserId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
  propertyId: z.string().optional(),
  unitLabel: z.string().optional(),
  dealId: z.string().optional(),
  status: z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"], { error: "Pick a status." }).optional(),
  waitingOn: z.string().optional(),
  scheduledFor: z.string().optional(),
  // JSON from the Repeat step in the due date's panel; blank for Doesn't repeat.
  repeatRule: z.string().optional(),
});

function pickedAssignee(v: string | undefined, legacyUserId: string | undefined): Assignee {
  if (v?.startsWith("u:") && v.length > 2) return { userId: v.slice(2) };
  if (v?.startsWith("c:") && v.length > 2) return { contactId: v.slice(2) };
  if (v === undefined && legacyUserId) return { userId: legacyUserId };
  return null;
}

/** The repeat rule posted as JSON, or a plain refusal when it doesn't read. */
function postedRepeat(json: string | undefined) {
  if (!json) return null;
  try {
    return repeatRuleSchema.parse(JSON.parse(json));
  } catch {
    throw new tasks.TaskRuleError("Pick the repeat again.");
  }
}

export type CreatedTask = { id: string; title: string };

/** Creates the task and says which one, for "Task created · Open". */
export async function createTask(formData: FormData): Promise<ActionResult<CreatedTask>> {
  return withResult("createTask", async () => {
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
        unitLabel: p.propertyId ? p.unitLabel : undefined,
        dealId: p.dealId,
        assignee,
        assigneeName: assignee ? null : p.assigneeName,
        status: p.status,
        waitingOn: p.waitingOn,
        scheduledFor: p.status === "SCHEDULED" ? p.scheduledFor : null,
        repeatRule: postedRepeat(p.repeatRule),
      },
      tasks.staffPrincipal(user),
    );
    return { id: task.id, title: task.title };
  });
}
