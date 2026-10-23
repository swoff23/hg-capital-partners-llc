"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { isActiveStatus } from "@/lib/task-scope";
import { withResult } from "@/lib/server-action";
import { moveTaskDates, restoreTaskDates } from "@/lib/tasks/bulk";
import type { DateChange } from "@/lib/tasks/list";
import * as tasks from "@/lib/tasks/service";

/**
 * Actions behind the task lists (Today, All, Home's card). Each returns a
 * result instead of throwing, so a failed save shows a toast and puts the
 * row back rather than sending the page to its error boundary.
 */

const taskId = z.string().min(1).max(64);
const status = z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED"]);
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
 * The checkbox: Done, or back to To do. Sends the status the row showed, so
 * a tap on a stale row changes nothing (the service refreshes the lists). If
 * the task already ended up where the tap wanted (the other partner ticked
 * it, or reopened it), that's a quiet success; otherwise, Canceled included,
 * the toast says who moved it.
 */
export async function setTaskDone(id: string, done: boolean, expected: string): Promise<ActionResult> {
  return withResult("setTaskDone", async () => {
    const user = await requireUser();
    const want = z.boolean().parse(done);
    try {
      await tasks.setTaskStatus(taskId.parse(id), want ? "DONE" : "OPEN", tasks.staffPrincipal(user), { expected: status.parse(expected) });
    } catch (err) {
      if (err instanceof tasks.TaskChangedError && (want ? err.current === "DONE" : isActiveStatus(err.current))) return;
      throw err;
    }
  });
}

/** Needs review: Approve makes the job Done (D6b). */
export async function approveTask(id: string): Promise<ActionResult> {
  return withResult("approveTask", async () => {
    const user = await requireUser();
    await tasks.setTaskStatus(taskId.parse(id), "DONE", tasks.staffPrincipal(user), { expected: "REVIEW" });
  });
}

/** Needs review: Send back returns the job to In progress with a note the contractor sees (D6b). */
export async function sendBackTask(id: string, note: string): Promise<ActionResult> {
  return withResult("sendBackTask", async () => {
    const user = await requireUser();
    const tid = taskId.parse(id);
    const body = z.string().trim().min(1, "Add a short note for the contractor.").max(2000).parse(note);
    await tasks.setTaskStatus(tid, "IN_PROGRESS", tasks.staffPrincipal(user), { note: body, expected: "REVIEW" });
  });
}
