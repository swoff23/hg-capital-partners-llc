"use client";
import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { GENERIC_ERROR, type ActionResult } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import {
  applyPatch,
  assigneeName,
  movedAllMessage,
  movedMessage,
  targetField,
  type DateChange,
  type ListPatch,
  type ListTask,
} from "@/lib/tasks/list";
import { approveTask, rescheduleTasks, sendBackTask, setTaskDone, undoReschedule } from "./list-actions";

/**
 * The rows a task list shows and the edits it makes, shared by Today, All
 * and Home's card. Each edit shows at once (useOptimistic), then the server
 * action runs; its revalidation brings the real rows back. A failure puts
 * the row back as it was and says why in a toast. Reschedules toast with an
 * Undo that restores the old dates.
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

  function run<T>(optimistic: ListPatch, action: () => Promise<ActionResult<T>>, onDone?: (data: T) => void) {
    startTransition(async () => {
      patch(optimistic);
      let result: ActionResult<T>;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: GENERIC_ERROR };
      }
      if (result.ok) onDone?.(result.data);
      else toast({ message: result.error });
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
      run({ kind: "check", id: task.id, checked: done }, () => setTaskDone(task.id, done));
    },
    approve(task) {
      run({ kind: "status", id: task.id, status: "DONE" }, () => approveTask(task.id), () => toast({ message: `Approved: ${task.title}` }));
    },
    sendBack(task, note) {
      const who = assigneeName(task.assignee)?.split(" ")[0];
      run(
        { kind: "status", id: task.id, status: "IN_PROGRESS" },
        () => sendBackTask(task.id, note),
        () => toast({ message: who ? `Sent back to ${who}` : "Sent back" }),
      );
    },
  };

  return <TaskListContext value={api}>{children}</TaskListContext>;
}
