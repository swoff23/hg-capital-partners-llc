"use server";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withResult } from "@/lib/server-action";
import type { Assignee } from "@/lib/tasks/core";
import { newTaskSchema } from "@/lib/tasks/new-task";
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
 * that caused it, and nothing typed is lost. The schema is new-task.ts
 * newTaskSchema, held to the limits the task page saves within.
 */

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
    const p = newTaskSchema.parse(formToObject(formData));
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
