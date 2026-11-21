"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { isActiveStatus } from "@/lib/task-scope";
import { withResult } from "@/lib/server-action";
import {
  bulkAssign as assignMany,
  bulkDeleteTasks,
  bulkMoveDates,
  bulkSetProperty,
  bulkSetStatus,
  moveTaskDates,
  restoreTaskDates,
  undoBulkAssign as undoAssignMany,
  undoBulkMoveDates,
  undoBulkProperty as undoPropertyMany,
  undoBulkStatus as undoStatusMany,
} from "@/lib/tasks/bulk";
import type { AssignChange, BulkSkips, DateMove, PropertyChange, StatusChange } from "@/lib/tasks/bulk-core";
import type { DateChange, TickResult } from "@/lib/tasks/list";
import { approved, approvedTick, type ApprovedResult } from "@/lib/tasks/approve";
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
 * any row's date chip, contractor jobs included, and "scheduled" for the
 * Tasks page's Scheduled column (bulk.ts moveTaskDates). Returns the dates as
 * they were, for Undo.
 */
export async function rescheduleTasks(ids: string[], to: string | null, which: "due" | "scheduled"): Promise<ActionResult<DateChange[]>> {
  return withResult("rescheduleTasks", async () => {
    const user = await requireUser();
    return moveTaskDates(
      z.array(taskId).min(1).max(500).parse(ids),
      ymd.parse(to),
      z.enum(["due", "scheduled"]).parse(which),
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
    const shown = status.parse(expected);
    // Needs review to Done is Approve, whichever control sends it: a tab from before the lists sent this tick
    // through approveTask still gets Approve's answer.
    if (want && shown === "REVIEW") {
      return approvedTick(() => tasks.setTaskStatus(taskId.parse(id), "DONE", tasks.staffPrincipal(user), { expected: "REVIEW" }));
    }
    try {
      const { nextDue } = await tasks.setTaskStatus(taskId.parse(id), want ? "DONE" : "OPEN", tasks.staffPrincipal(user), {
        expected: shown,
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
    return approved(() => tasks.setTaskStatus(taskId.parse(id), "DONE", tasks.staffPrincipal(user), { expected: "REVIEW" }));
  });
}

export type { ApprovedResult };

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

// ---------------------------------------------------------------------------
// Bulk edit (docs/specs/bulk-edit.md): the Tasks list's bar. Each answers what
// changed (for Undo), how many are now as asked, and what it skipped and why.
// ---------------------------------------------------------------------------

/** 400 rows show at most (LIST_CEILING); the cap leaves room, as rescheduleTasks's does. */
const ids = z.array(taskId).min(1).max(500);
const assignee = z.union([z.object({ userId: taskId }).strict(), z.object({ contactId: taskId }).strict(), z.null()]);
const waitingText = z.string().trim().min(1, "Say what it's waiting on.").max(300);
const statusChanges = z
  .array(
    z
      .object({
        id: taskId,
        from: status,
        to: status,
        waitingOn: z.string().max(300).nullable(),
        scheduledFor: ymd,
        setWaitingOn: z.string().max(300).nullable(),
        setScheduledFor: ymd,
        approvedEventId: z.string().min(1).max(64).nullable(),
      })
      .strict(),
  )
  .min(1)
  .max(500);
const assignChanges = z
  .array(z.object({ id: taskId, from: assignee, to: assignee, fromName: z.string().max(200).nullable().optional() }).strict())
  .min(1)
  .max(500);
const place = z.object({ propertyId: taskId.nullable(), unitLabel: z.string().max(100).nullable() }).strict();
const propertyChanges = z.array(z.object({ id: taskId, from: place, to: place }).strict()).min(1).max(500);

export type BulkAnswer<C> = { changed: C[]; done: number; skipped: BulkSkips; refusal?: string };

/**
 * One status for every pick, each sent with the status its row showed.
 * Waiting takes one reason and Scheduled one visit date for all of them.
 */
export async function bulkStatus(
  picks: { id: string; expected: string }[],
  to: string,
  opts: { waitingOn?: string; scheduledFor?: string } = {},
): Promise<ActionResult<BulkAnswer<StatusChange>>> {
  return withResult("bulkStatus", async () => {
    const user = await requireUser();
    const next = status.parse(to);
    const list = z.array(z.object({ id: taskId, expected: status }).strict()).min(1).max(500).parse(picks);
    return bulkSetStatus(
      list,
      next,
      {
        ...(next === "WAITING" ? { waitingOn: waitingText.parse(opts.waitingOn) } : {}),
        ...(next === "SCHEDULED" ? { scheduledFor: ymd.unwrap().parse(opts.scheduledFor) } : {}),
      },
      tasks.staffPrincipal(user),
    );
  });
}

export async function undoBulkStatus(changes: StatusChange[]): Promise<ActionResult<{ done: number; skipped: BulkSkips }>> {
  return withResult("undoBulkStatus", async () => {
    const user = await requireUser();
    return undoStatusMany(statusChanges.parse(changes), tasks.staffPrincipal(user));
  });
}

/** One assignee for every pick (null for nobody), each sent with who its row showed. `emails`: jobs that queued the contractor an email. */
export async function bulkAssign(
  picks: { id: string; expected: { userId: string } | { contactId: string } | null }[],
  to: { userId: string } | { contactId: string } | null,
): Promise<ActionResult<BulkAnswer<AssignChange> & { emails: number }>> {
  return withResult("bulkAssign", async () => {
    const user = await requireUser();
    const list = z.array(z.object({ id: taskId, expected: assignee }).strict()).min(1).max(500).parse(picks);
    return assignMany(list, assignee.parse(to), tasks.staffPrincipal(user));
  });
}

export async function undoBulkAssign(changes: AssignChange[]): Promise<ActionResult<{ done: number; skipped: BulkSkips }>> {
  return withResult("undoBulkAssign", async () => {
    const user = await requireUser();
    return undoAssignMany(assignChanges.parse(changes), tasks.staffPrincipal(user));
  });
}

/** One property for every pick (null for none); each keeps its unit when the new building has it. */
export async function bulkProperty(taskIds: string[], propertyId: string | null): Promise<ActionResult<BulkAnswer<PropertyChange>>> {
  return withResult("bulkProperty", async () => {
    const user = await requireUser();
    return bulkSetProperty(ids.parse(taskIds), taskId.nullable().parse(propertyId), tasks.staffPrincipal(user));
  });
}

export async function undoBulkProperty(changes: PropertyChange[]): Promise<ActionResult<{ done: number; skipped: BulkSkips }>> {
  return withResult("undoBulkProperty", async () => {
    const user = await requireUser();
    return undoPropertyMany(propertyChanges.parse(changes), tasks.staffPrincipal(user));
  });
}

/**
 * One due date for every pick (null clears), contractor jobs included: their
 * scheduled day is never moved in bulk. Closed tasks are skipped. Undo is
 * undoBulkDue with the moves it returns.
 */
export async function bulkDue(taskIds: string[], to: string | null): Promise<ActionResult<BulkAnswer<DateMove>>> {
  return withResult("bulkDue", async () => {
    const user = await requireUser();
    return bulkMoveDates(ids.parse(taskIds), ymd.parse(to), tasks.staffPrincipal(user));
  });
}

const dateMoves = z
  .array(z.object({ id: taskId, field: z.enum(["dueDate", "scheduledFor"]), value: ymd, set: ymd }).strict())
  .min(1)
  .max(500);

/** A bulk date's Undo: each back unless someone changed it since, or it closed. */
export async function undoBulkDue(moves: DateMove[]): Promise<ActionResult<{ done: number; skipped: BulkSkips }>> {
  return withResult("undoBulkDue", async () => {
    const user = await requireUser();
    return undoBulkMoveDates(dateMoves.parse(moves), tasks.staffPrincipal(user));
  });
}

/** Gone for good, files and all. One that fails is counted; the rest still go. */
export async function bulkDelete(taskIds: string[]): Promise<ActionResult<{ deleted: number; failed: number }>> {
  return withResult("bulkDelete", async () => {
    const user = await requireUser();
    return bulkDeleteTasks(ids.parse(taskIds), tasks.staffPrincipal(user));
  });
}
