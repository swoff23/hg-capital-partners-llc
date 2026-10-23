"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import { moveTaskDates, restoreTaskDates } from "@/lib/tasks/bulk";
import type { DateChange } from "@/lib/tasks/list";
import { taskStatus } from "@/lib/tasks/queries";
import * as tasks from "@/lib/tasks/service";

/**
 * Actions behind the task lists (Today, All, Home's card). Each returns a
 * result instead of throwing, so a failed save shows a toast and puts the
 * row back rather than sending the page to its error boundary.
 */

const taskId = z.string().min(1).max(64);
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const dateChanges = z
  .array(
    z
      .object({ id: taskId, field: z.enum(["dueDate", "scheduledFor"]), value: ymd })
      .strict(),
  )
  .max(500);

/**
 * Refresh the lists without a write. For a change the server skips or refuses
 * because the row on screen is out of date (the other partner already ticked
 * it, or already approved it): the optimistic edit rolls back onto fresh rows
 * instead of the stale ones.
 */
function refreshLists(): void {
  revalidatePath("/tasks");
  revalidatePath("/tasks/all");
  revalidatePath("/");
}

/**
 * Move one or more tasks to a date (null clears it). `which` is "due" for
 * staff tasks and "target" for a contractor's job (the visit date while
 * Scheduled). Returns the dates as they were, for Undo.
 */
export async function rescheduleTasks(ids: string[], to: string | null, which: "due" | "target"): Promise<ActionResult<DateChange[]>> {
  return withResult("rescheduleTasks", async () => {
    const user = await requireUser();
    return moveTaskDates(
      z.array(taskId).min(1).max(500).parse(ids),
      ymd.parse(to),
      z.enum(["due", "target"]).parse(which),
      tasks.staffPrincipal(user),
    );
  });
}

/** Undo a reschedule: put every date back as it was. */
export async function undoReschedule(changes: DateChange[]): Promise<ActionResult> {
  return withResult("undoReschedule", async () => {
    const user = await requireUser();
    await restoreTaskDates(dateChanges.parse(changes), tasks.staffPrincipal(user));
  });
}

/**
 * The checkbox: Done, or back to To do (service.toggleTask). Says which way
 * it should end up, so a tap on a row the other partner already ticked
 * doesn't flip it back.
 */
export async function setTaskDone(id: string, done: boolean): Promise<ActionResult> {
  return withResult("setTaskDone", async () => {
    const user = await requireUser();
    const tid = taskId.parse(id);
    const status = await taskStatus(tid);
    const want = z.boolean().parse(done);
    if (!status || want === (status === "DONE")) {
      refreshLists();
      if (!status) throw new tasks.TaskRuleError("That task no longer exists.");
      return;
    }
    await tasks.toggleTask(tid, tasks.staffPrincipal(user));
  });
}

async function assertInReview(id: string): Promise<void> {
  const status = await taskStatus(id);
  if (status === "REVIEW") return;
  refreshLists();
  throw new tasks.TaskRuleError(status ? "This job isn't waiting on review anymore." : "That job no longer exists.");
}

/** Needs review: Approve makes the job Done (D6b). */
export async function approveTask(id: string): Promise<ActionResult> {
  return withResult("approveTask", async () => {
    const user = await requireUser();
    const tid = taskId.parse(id);
    await assertInReview(tid);
    await tasks.setTaskStatus(tid, "DONE", tasks.staffPrincipal(user));
  });
}

/** Needs review: Send back returns the job to In progress with a note the contractor sees (D6b). */
export async function sendBackTask(id: string, note: string): Promise<ActionResult> {
  return withResult("sendBackTask", async () => {
    const user = await requireUser();
    const tid = taskId.parse(id);
    const body = z.string().trim().min(1, "Add a short note for the contractor.").max(2000).parse(note);
    await assertInReview(tid);
    await tasks.setTaskStatus(tid, "IN_PROGRESS", tasks.staffPrincipal(user), { note: body });
  });
}
