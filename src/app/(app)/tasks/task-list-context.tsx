"use client";
import { createContext, useContext, useMemo, useOptimistic, useState, useTransition, type ReactNode } from "react";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { assigneeRows } from "@/components/entity-picker";
import type { OptionItem, OptionSection } from "@/components/option-list";
import { useToast } from "@/components/toast";
import { callAction, type ActionResult } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import {
  applyPatch,
  assigneeName,
  assigneeValueOf,
  doneMessage,
  movedAllMessage,
  movedMessage,
  targetField,
  tickPlan,
  type DateChange,
  type ListAssignee,
  type ListPatch,
  type ListTask,
} from "@/lib/tasks/list";
import { shortName } from "@/lib/tasks/list-sort";
import { updateTask } from "./[id]/actions";
import { approveTask, rescheduleTasks, sendBackTask, setTaskDone, undoApprove, undoDone, undoReschedule } from "./list-actions";

/**
 * The rows a task list shows and the edits it makes, shared by Today (on
 * Home) and All. Each edit shows at once (useOptimistic), then the server
 * action runs; its revalidation brings the real rows back. A failure puts
 * the row back as it was and says why in a toast. Reschedules toast with an
 * Undo that restores the old dates; a tick toasts with an Undo that puts the
 * task back to the status it had. With `people`, a row's Assignee cell
 * reassigns it in place (AssigneeCell), toasting with an Undo too.
 */

/** Who the list's Assignee cells offer, as the task page's picker gets them (assigneeOptions). */
export interface TaskPeople {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  /** The signed-in user: first in Team, with "(you)". */
  meId: string;
  /** The people the viewer assigned last, for the picker's Recent rows. */
  recent: AssigneeValue[];
}

interface TaskListApi {
  tasks: ListTask[];
  /** Buffalo's today, from the server, so every label and section agrees. */
  today: Ymd;
  /** Set where a row's Assignee cell can reassign it (the Tasks page); without it the cell only shows who. */
  people: TaskPeople | null;
  /** The picker's rows for `people`, built once for every row's cell. */
  peopleRows: { pinned: OptionItem[]; sections: OptionSection[] } | null;
  /** Reassign from the row: the task service refuses it when someone else reassigned the task since the list loaded. */
  assign: (task: ListTask, to: AssigneeValue) => void;
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

/** The row's assignee for a pick, from the people on offer; null for nobody, or someone no longer offered. */
function listAssigneeOf(v: AssigneeValue, people: TaskPeople): ListAssignee | null {
  if (!v) return null;
  if ("userId" in v) {
    const u = people.users.find((x) => x.id === v.userId);
    return u ? { kind: "user", id: u.id, name: u.name, email: u.email } : null;
  }
  const c = people.contractors.find((x) => x.id === v.contactId);
  return c ? { kind: "contact", id: c.id, name: c.name, hasLogin: c.hasLogin } : null;
}

export function TaskListProvider({
  tasks: rows,
  today,
  people = null,
  children,
}: {
  tasks: ListTask[];
  today: Ymd;
  people?: TaskPeople | null;
  children: ReactNode;
}) {
  const [tasks, patch] = useOptimistic(rows, applyPatch);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const peopleRows = useMemo(
    () => (people ? assigneeRows({ users: people.users, contractors: people.contractors, meId: people.meId, recent: people.recent }) : null),
    [people],
  );

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
    people,
    peopleRows,
    assign(task, to) {
      if (!people) return;
      // The assignee this row showed, so a reassignment from a stale list is refused instead of taking
      // the job off whoever has it now. An imported name is nobody to the service.
      const was = assigneeValueOf(task.assignee);
      const next = listAssigneeOf(to, people);
      const who = to && "userId" in to && to.userId === people.meId ? "you" : shortName(assigneeName(next));
      run(
        { kind: "assignee", id: task.id, assignee: next },
        () => updateTask(task.id, { assignee: to, expectedAssignee: was }),
        () =>
          toast({
            // The task page's words, and its key, so a quick second pick replaces this toast.
            message: who ? `Assigned to ${who}` : "Unassigned",
            key: `task:${task.id}:assignee`,
            // A pick clears an imported name for good (core.ts patchTask), so there's no Undo back to one.
            ...(task.assignee?.kind === "name"
              ? {}
              : {
                  action: {
                    label: "Undo",
                    onAction: () => run({ kind: "restore", task }, () => updateTask(task.id, { assignee: was, expectedAssignee: to })),
                  },
                }),
          }),
      );
    },
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
      const { shown, approves, holds } = tickPlan(task, done);
      // An untick while the row's approval is still saving: the toast's Undo is the way back, not a second move.
      if (holds) return;
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
