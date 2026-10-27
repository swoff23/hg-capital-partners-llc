"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { isActiveStatus } from "@/lib/task-scope";
import { withResult } from "@/lib/server-action";
import { moveTaskDates, restoreTaskDates } from "@/lib/tasks/bulk";
import type { DateChange, TickResult } from "@/lib/tasks/list";
import * as tasks from "@/lib/tasks/service";

/**
 * Actions behind the task lists (Today on Home, and All). Each returns a
 * result instead of throwing, so a failed save shows a toast and puts the
 * row back rather than sending the page to its error boundary.
 */

const taskId = z.string().min(1).max(64);
const status = z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED"]);
const notDone = status.exclude(["DONE"]);
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
 * the toast says who moved it. A tick that finished the task returns what
 * its Done toast says; anything else returns null.
 */
export async function setTaskDone(id: string, done: boolean, expected: string): Promise<ActionResult<TickResult | null>> {
  return withResult("setTaskDone", async () => {
    const user = await requireUser();
    const want = z.boolean().parse(done);
    try {
      const { nextDue } = await tasks.setTaskStatus(taskId.parse(id), want ? "DONE" : "OPEN", tasks.staffPrincipal(user), {
        expected: status.parse(expected),
      });
      return want ? { nextDue } : null;
    } catch (err) {
      if (err instanceof tasks.TaskChangedError && (want ? err.current === "DONE" : isActiveStatus(err.current))) return null;
      throw err;
    }
  });
}

/**
 * The Done toast's Undo: back to the status the row showed before the tick,
 * Canceled included, with what it was waiting on. It expects Done, so a
 * stale Undo (the task moved on since) changes nothing and the toast says who
 * moved it; already back where Undo wanted is a quiet success. Reopening
 * takes back the repeat copy the tick made while nobody has touched it
 * (core.ts takeBackRepeat).
 */
export async function undoDone(id: string, to: string, waitingOn: string | null): Promise<ActionResult> {
  return withResult("undoDone", async () => {
    const user = await requireUser();
    const back = notDone.parse(to);
    try {
      await tasks.setTaskStatus(taskId.parse(id), back, tasks.staffPrincipal(user), {
        expected: "DONE",
        ...(back === "WAITING" ? { waitingOn: z.string().max(300).nullable().parse(waitingOn) } : {}),
      });
    } catch (err) {
      if (err instanceof tasks.TaskChangedError && err.current === back) return;
      throw err;
    }
  });
}

/**
 * Needs review: Approve makes the job Done (D6b). Returns the Done line it
 * wrote, which the toast's Undo names. A job that is already Done (the other
 * partner approved it first) is a quiet success with nothing to undo
 * (`approvedEventId` null): what was asked is true.
 */
export async function approveTask(id: string): Promise<ActionResult<ApprovedResult>> {
  return withResult("approveTask", async () => {
    const user = await requireUser();
    try {
      const { statusEventId, emailsContractor } = await tasks.setTaskStatus(taskId.parse(id), "DONE", tasks.staffPrincipal(user), {
        expected: "REVIEW",
      });
      return { approvedEventId: statusEventId, emailsContractor };
    } catch (err) {
      if (err instanceof tasks.TaskChangedError && err.current === "DONE") return { approvedEventId: null, emailsContractor: false };
      throw err;
    }
  });
}

/** What Approve answers: the Done line it wrote (the toast's Undo names it), and whether the contractor will hear. */
export type ApprovedResult = { approvedEventId: string | null; emailsContractor: boolean };

/**
 * Approve's Undo: back to Review as if never approved, which also takes back
 * the next repeat copy while nobody has touched it (core.ts undoApproval). The
 * job moving on first is refused with who moved it.
 */
export async function undoApprove(id: string, approvedEventId: string): Promise<ActionResult> {
  return withResult("undoApprove", async () => {
    const user = await requireUser();
    await tasks.undoTaskApproval(taskId.parse(id), z.string().min(1).max(64).parse(approvedEventId), tasks.staffPrincipal(user));
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
