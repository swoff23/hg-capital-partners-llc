"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { withResult } from "@/lib/server-action";
import type { Assignee } from "@/lib/tasks/core";
import { newChecklistSchema, newTaskSchema } from "@/lib/tasks/new-task-schema";
import { MAX_FILENAME } from "@/lib/attachments/content-types";
import { appScope, assertQueueOwner } from "@/lib/attachments/queue-owner";
import { discardNewTaskUploads, recordNewTaskUpload, removeNewTaskUpload } from "@/lib/tasks/new-task-uploads";
import { repeatRuleSchema } from "@/lib/tasks/repeat-schema";
import * as tasks from "@/lib/tasks/service";
import { makeTaskChecklist } from "@/lib/missing/service";
import { prisma } from "@/lib/db";
import { homeOccupied } from "@/lib/tenants/living";

/**
 * Thin server action for New task (forms 2.12, 4.4): authenticate, validate,
 * call the task service, and answer with `{ id }` instead of redirecting, so
 * the sheet decides whether to stay where you were or open the task. The
 * form posts the same field names the page form always did: `assignee`
 * ("u:<id>", "c:<id>" or blank), `dueDate`, `repeatRule` (JSON), `status`,
 * `waitingOn`, `scheduledFor`, and now `unitLabel`. A refusal comes back as a
 * value (`withResult`): a zod failure puts its plain message on the field
 * that caused it, and nothing typed is lost. The schema is new-task-schema.ts
 * newTaskSchema, held to the limits the task page saves within.
 */

function pickedAssignee(v: string | undefined, legacyUserId: string | undefined): Assignee {
  if (v?.startsWith("u:") && v.length > 2) return { userId: v.slice(2) };
  if (v?.startsWith("c:") && v.length > 2) return { contactId: v.slice(2) };
  if (v === undefined && legacyUserId) return { userId: legacyUserId };
  return null;
}

/** The Checklist section's items posted as JSON, or a plain refusal when they don't read. */
function postedChecklist(json: string | undefined): string[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new tasks.TaskRuleError("Add the checklist items again.");
  }
  const parsed = newChecklistSchema.safeParse(raw);
  if (!parsed.success) throw new tasks.TaskRuleError(parsed.error.issues[0]?.message ?? "Add the checklist items again.");
  return parsed.data;
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

/**
 * Whether somebody lives in the picked home today, for New task's Permission to enter switch (docs/specs/tenants.md
 * section 8, T11). A yes or no only: no names, numbers or lease fields reach the form.
 */
export async function homeHasTenants(propertyId: string, unitLabel: string | null): Promise<boolean> {
  await requireUser();
  const pid = z.string().min(1).max(64).parse(propertyId);
  const unit = unitLabel === null ? null : z.string().max(200).parse(unitLabel);
  return homeOccupied(prisma, pid, unit);
}

/** Creates the task and says which one, for "Task created · Open". */
export async function createTask(formData: FormData): Promise<ActionResult<CreatedTask>> {
  return withResult("createTask", async () => {
    const user = await requireUser();
    const p = newTaskSchema.parse(formToObject(formData));
    const assignee = pickedAssignee(p.assignee, p.assigneeUserId);
    if (p.status === "SCHEDULED" && !p.scheduledFor) throw new tasks.TaskRuleError("Pick the scheduled day.");
    // Make task: each Missing info row becomes a checklist item that ticks itself once it's filled in. Typed items
    // follow them (docs/specs/new-task-checklist-photos.md, section 3.4).
    const fromMissing = p.missing ? await makeTaskChecklist(p.missing.split(",").filter(Boolean), user) : [];
    const typed = postedChecklist(p.checklist).map((title) => ({ title }));
    const checklist = [...fromMissing, ...typed];
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
        checklist: checklist.length ? checklist : undefined,
        entryPermitted: p.entryPermitted === "on",
      },
      tasks.staffPrincipal(user),
      { formId: p.formId || null },
    );
    return { id: task.id, title: task.title };
  });
}

/* ---------------- New task's files (docs/specs/new-task-checklist-photos.md, section 3) ---------------- */

const formIdText = z.string().min(1).max(64);

// Where the browser put the file and what to call it; never its URL, size or type (the service reads those from Blob).
const heldSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(MAX_FILENAME * 4),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
  })
  .strict();

/**
 * The record step for New task's upload queue: hold the file for Create, or attach it to the task Create already made.
 * `queueOwner` is the queue's scope (queue-owner.ts), so a tab left open under another sign-in can't record as them.
 */
export async function recordNewTaskFile(formId: string, data: z.input<typeof heldSchema>, queueOwner?: string | null): Promise<ActionResult<{ id: string }>> {
  return withResult("recordNewTaskFile", async () => {
    const user = await requireUser();
    assertQueueOwner(z.string().max(80).nullish().parse(queueOwner), appScope(user.id));
    return recordNewTaskUpload(user.id, formIdText.parse(formId), heldSchema.parse(data));
  });
}

/** Remove on a tile before Create: gone for good. */
export async function removeNewTaskFile(id: string): Promise<ActionResult> {
  return withResult("removeNewTaskFile", async () => {
    const user = await requireUser();
    await removeNewTaskUpload(user.id, z.string().min(1).max(64).parse(id));
  });
}

/** Discard changes, or Clear on the draft line: the form's files go, unless it already made its task. */
export async function discardNewTaskFiles(formId: string): Promise<ActionResult> {
  return withResult("discardNewTaskFiles", async () => {
    const user = await requireUser();
    await discardNewTaskUploads(user.id, formIdText.parse(formId));
  });
}
