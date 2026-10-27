"use client";
import { createContext, useContext, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { callAction, type ActionResult } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import {
  applyPatch,
  assigneeName,
  doneMessage,
  movedAllMessage,
  movedMessage,
  targetField,
  tickPlan,
  type DateChange,
  type ListPatch,
  type ListTask,
} from "@/lib/tasks/list";
import { approveTask, rescheduleTasks, sendBackTask, setTaskDone, undoApprove, undoDone, undoReschedule } from "./list-actions";

/**
 * The rows a task list shows and the edits it makes, shared by Today (on
 * Home) and All. Each edit shows at once (useOptimistic), then the server
 * action runs; its revalidation brings the real rows back. A failure puts
 * the row back as it was and says why in a toast. Reschedules toast with an
 * Undo that restores the old dates; a tick toasts with an Undo that puts the
 * task back to the status it had.
 */

interface TaskListApi {
  tasks: ListTask[];
  /** Buffalo's today, from the server, so every label and section agrees. */
  today: Ymd;
  /** "due" for staff tasks; "target" moves a contractor job's visit date while it's Scheduled. */
  reschedule: (task: ListTask, to: Ymd | null, which: "due" | "target") => void;
  moveAllToToday: (tasks: ListTask[]) => void;
  setDone: (task: ListTask, done: boolean) => void;
  approve: (task: ListTask) => void;
  sendBack: (task: ListTask, note: string) => void;
  /** A Send back note that didn't go through, to start the sheet with next time. */
  sendBackDraft: (taskId: string) => string;
}

const TaskListContext = createContext<TaskListApi | null>(null);

export function useTaskList(): TaskListApi {
  const ctx = useContext(TaskListContext);
  if (!ctx) throw new Error("useTaskList needs a TaskListProvider above it.");
  return ctx;
}

export function TaskListProvider({ tasks: rows, today, children }: { tasks: ListTask[]; today: Ymd; children: ReactNode }) {
  const [tasks, patch] = useOptimistic(rows, applyPatch);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function run<T>(optimistic: ListPatch, action: () => Promise<ActionResult<T>>, onDone?: (data: T) => void, onFailed?: () => void) {
    startTransition(async () => {
      patch(optimistic);
      const result = await callAction(action);
      if (result.ok) onDone?.(result.data);
      else {
        toast({ message: result.error });
        onFailed?.();
      }
    });
  }

  function keepDraft(taskId: string, note: string | null) {
    setDrafts((all) => {
      const next = { ...all };
      if (note) next[taskId] = note;
      else delete next[taskId];
      return next;
    });
  }

  function undo(changes: DateChange[]) {
    run({ kind: "dates", changes }, () => undoReschedule(changes));
  }

  function moved(message: string) {
    return (changes: DateChange[]) => {
      if (changes.length) toast({ message, action: { label: "Undo", onAction: () => undo(changes) } });
    };
  }

  const api: TaskListApi = {
    tasks,
    today,
    reschedule(task, to, which) {
      const field = which === "target" ? targetField(task) : "dueDate";
      run({ kind: "dates", changes: [{ id: task.id, field, value: to }] }, () => rescheduleTasks([task.id], to, which), moved(movedMessage(to)));
    },
    moveAllToToday(list) {
      if (!list.length) return;
      run(
        { kind: "dates", changes: list.map((t) => ({ id: t.id, field: "dueDate", value: today })) },
        () => rescheduleTasks(
          list.map((t) => t.id),
          today,
          "due",
        ),
        (changes) => moved(movedAllMessage(changes.length))(changes),
      );
    },
    setDone(task, done) {
      // The status the row shows, and whether this tick is an approval (tickPlan).
      const { shown, approves } = tickPlan(task, done);
      // A tick that finished it says so, with an Undo back to the status it
      // had, Canceled included. An untick, or a tick someone else beat, says
      // nothing. Undo puts the row itself back: by then the refresh has
      // dropped it from Today and All > Open.
      const ticked = (nextDue: Ymd | null, undoTick: () => Promise<ActionResult>) => {
        const back: ListPatch = { kind: "restore", task: { ...task, status: shown, checked: false } };
        toast({ message: doneMessage(task.title, nextDue, today), action: { label: "Undo", onAction: () => run(back, undoTick) } });
      };
      // A Needs review row ticked: Approve, and Approve's Undo back to Review as if never approved, with the same toast.
      if (approves) {
        run({ kind: "check", id: task.id, checked: true }, () => approveTask(task.id), ({ approvedEventId, nextDue }) => {
          if (approvedEventId) ticked(nextDue, () => undoApprove(task.id, approvedEventId));
        });
        return;
      }
      run(
        { kind: "check", id: task.id, checked: done },
        () => setTaskDone(task.id, done, shown),
        (result) => {
          if (result) ticked(result.nextDue, () => undoDone(task.id, shown, task.waitingOn));
        },
      );
    },
    approve(task) {
      const who = assigneeName(task.assignee)?.split(" ")[0];
      run(
        { kind: "status", id: task.id, status: "DONE" },
        () => approveTask(task.id),
        ({ approvedEventId, emailsContractor }) => {
          // The other partner got there first: it is Done, which is what was asked, and there is nothing of ours to undo.
          if (!approvedEventId) return;
          const back: ListPatch = { kind: "restore", task: { ...task, status: "REVIEW", checked: false } };
          toast({
            message: "Approved",
            // Only when it is true: the contractor has a login. The email waits 3 minutes (10 at most from the
            // bundle's first line), and the server refuses Undo once it is claimed or sent, so Undo is honest.
            ...(emailsContractor && who ? { detail: `${who} gets an email` } : {}),
            action: { label: "Undo", onAction: () => run(back, () => undoApprove(task.id, approvedEventId)) },
          });
        },
      );
    },
    sendBack(task, note) {
      const who = assigneeName(task.assignee)?.split(" ")[0];
      run(
        { kind: "status", id: task.id, status: "IN_PROGRESS" },
        () => sendBackTask(task.id, note),
        () => {
          keepDraft(task.id, null);
          toast({ message: who ? `Sent back to ${who}` : "Sent back" });
        },
        // The row left Needs review while it saved, so its sheet is gone: keep the note for the next try.
        () => keepDraft(task.id, note),
      );
    },
    sendBackDraft: (taskId) => drafts[taskId] ?? "",
  };

  return <TaskListContext value={api}>{children}</TaskListContext>;
}
