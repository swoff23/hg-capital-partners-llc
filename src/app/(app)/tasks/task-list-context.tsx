"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
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
  tickPlan,
  toastDay,
  type DateChange,
  type ListAssignee,
  type ListPatch,
  type ListTask,
} from "@/lib/tasks/list";
import { personRefs } from "@/lib/tasks/assignee-people";
import { shortName } from "@/lib/tasks/list-sort";
import { updateTask } from "./[id]/actions";
import { addedLine, applyDraftChange, discardedLine, undoAddLine, undoDiscardLine, type DraftChange, type DraftLine, type DraftTask } from "./draft-copy";
import { addDraftTask, addDraftTasks, discardDraftTask, discardDraftTasks, restoreDraftTasks, undoAddDraftTasks, type AddedDraftResult } from "./draft-actions";
import { focusPressed, keepFocusBeyond, pressedControl, type PressedControl } from "./draft-focus";
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
  /** "due" moves the due date; "scheduled" moves a Scheduled job's day (never cleared). */
  reschedule: (task: ListTask, to: Ymd | null, which: "due" | "scheduled") => void;
  moveAllToToday: (tasks: ListTask[]) => void;
  setDone: (task: ListTask, done: boolean) => void;
  approve: (task: ListTask) => void;
  sendBack: (task: ListTask, note: string) => void;
  /** A Send back note that didn't go through, to start the sheet with next time. */
  sendBackDraft: (taskId: string) => string;
  /**
   * Any other edit the list makes (the bulk bar, bulk-bar.tsx): shows `optimistic` at once, runs the action,
   * then `onDone` with its answer; a refusal toasts why and puts the rows back.
   */
  runEdit: <T>(optimistic: ListPatch, action: () => Promise<ActionResult<T>>, onDone?: (data: T) => void, onFailed?: () => void) => void;
  /**
   * The drafts from Claude the Tasks page shows (mine and the other partner's), less any Add or Discard that is
   * saving. Kept apart from `tasks`: a draft is in no list, count or filter (docs/specs/tasks-from-claude.md 6.2).
   */
  drafts: DraftTask[];
  /** Add on a draft's row: it becomes a To do task; toasts what happened and who hears, with an Undo. */
  addDraft: (task: DraftTask) => void;
  /** Add all: every draft in My drafts, in one go or not at all. */
  addAllDrafts: (tasks: DraftTask[]) => void;
  /** Discard on a draft's row: gone at once, with an Undo that brings it back. */
  discardDraft: (task: DraftTask) => void;
  /** Discard all: every draft in My drafts, with one Undo. */
  discardAllDrafts: (tasks: DraftTask[]) => void;
}

const TaskListContext = createContext<TaskListApi | null>(null);

export function useTaskList(): TaskListApi {
  const ctx = useContext(TaskListContext);
  if (!ctx) throw new Error("useTaskList needs a TaskListProvider above it.");
  return ctx;
}

/** The row's assignee for a pick, from the people on offer; null for nobody, or someone no longer offered. */
export function listAssigneeOf(v: AssigneeValue, people: TaskPeople): ListAssignee | null {
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
  drafts: draftRows = [],
  children,
}: {
  tasks: ListTask[];
  today: Ymd;
  people?: TaskPeople | null;
  /** The Tasks page's drafts, mine and the other partner's, in one list. */
  drafts?: DraftTask[];
  children: ReactNode;
}) {
  const [tasks, patch] = useOptimistic(rows, applyPatch);
  const [drafts, patchDrafts] = useOptimistic(draftRows, applyDraftChange);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const [sendBackNotes, setSendBackNotes] = useState<Record<string, string>>({});
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

  /**
   * A draft's Add or Discard, or an Undo of one: the rows change at once (the Undo's rows are drawn from the change
   * itself, DraftSections) and the page's refresh settles them. A refusal puts them as they were and says why.
   */
  function runDraft<T>(change: DraftChange, action: () => Promise<ActionResult<T>>, onDone?: (data: T, refused: () => void) => void) {
    // The row's button is about to leave with its row: focus goes to the next row first (draft-focus.ts).
    let pressed: PressedControl | null = null;
    if (change.kind === "hide") {
      pressed = pressedControl();
      const movedTo = keepFocusBeyond(new Set(change.ids));
      if (pressed) pressed.movedTo = movedTo;
    }
    // A refusal brings the rows back, and focus goes back to the control that was pressed once they are (effect below).
    const refused = () => {
      refocus.current = pressed;
    };
    startTransition(async () => {
      patchDrafts(change);
      const result = await callAction(action);
      if (result.ok) onDone?.(result.data, refused);
      else {
        toast({ message: result.error });
        refused();
      }
    });
  }
  const refocus = useRef<PressedControl | null>(null);
  useEffect(() => {
    if (refocus.current && focusPressed(refocus.current)) refocus.current = null;
  }, [drafts]);

  const draftPeople = useMemo(() => (people ? personRefs(people.users, people.contractors) : []), [people]);

  function toastLine(line: DraftLine, extra: { action?: { label: string; onAction: () => void } } = {}) {
    toast({ ...line, ...extra });
  }

  /** Add's toast: what happened and who hears, with an Undo that makes them drafts again (the server holds it to two minutes). */
  function announceAdded(added: AddedDraftResult[], list: DraftTask[]) {
    if (added.length === 0) return;
    const adds = added.map(({ taskId, addEventId }) => ({ taskId, addEventId }));
    const shown = list.filter((t) => added.some((a) => a.taskId === t.id));
    toastLine(addedLine(added.map((a) => a.contractor), draftPeople), {
      action: {
        label: "Undo",
        onAction: () =>
          // The drafts are drawn again at once; what stayed a task goes again when the answer comes (the page's refresh).
          runDraft({ kind: "show", tasks: shown }, () => undoAddDraftTasks(adds), (out) => {
            const line = undoAddLine(adds.length, out.undone.length, out.kept);
            if (line) toastLine(line);
          }),
      },
    });
  }

  /** Discard's toast, with an Undo that brings the drafts back by their ids. */
  function announceDiscarded(ids: string[], list: DraftTask[]) {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    const shown = list.filter((t) => gone.has(t.id));
    toastLine(discardedLine(ids.length), {
      action: {
        label: "Undo",
        onAction: () =>
          runDraft({ kind: "show", tasks: shown }, () => restoreDraftTasks(ids), (out) => {
            const line = undoDiscardLine(ids.length, out.restored.length, out.gone.length);
            if (line) toastLine(line);
          }),
      },
    });
  }

  function keepDraft(taskId: string, note: string | null) {
    setSendBackNotes((all) => {
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
      const field = which === "scheduled" ? "scheduledFor" : "dueDate";
      run(
        { kind: "dates", changes: [{ id: task.id, field, value: to }] },
        () => rescheduleTasks([task.id], to, which),
        moved(which === "scheduled" && to ? `Scheduled for ${toastDay(to)}` : movedMessage(to)),
      );
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
    sendBackDraft: (taskId) => sendBackNotes[taskId] ?? "",
    drafts,
    runEdit: run,
    addDraft(task) {
      runDraft({ kind: "hide", ids: [task.id] }, () => addDraftTask(task.id), (added) => announceAdded([added], [task]));
    },
    addAllDrafts(list) {
      if (!list.length) return;
      runDraft({ kind: "hide", ids: list.map((t) => t.id) }, () => addDraftTasks(list.map((t) => t.id)), (out, refused) => {
        if (out.added) return announceAdded(out.added, list);
        // Nothing was added: the refusal's own line, and a button to the draft that stopped it.
        refused();
        const { taskId, message } = out.refused;
        toast({ message, action: { label: "Open", onAction: () => router.push(`/tasks/${taskId}`) } });
      });
    },
    discardDraft(task) {
      runDraft({ kind: "hide", ids: [task.id] }, () => discardDraftTask(task.id), (out) => announceDiscarded(out.ids, [task]));
    },
    discardAllDrafts(list) {
      if (!list.length) return;
      runDraft({ kind: "hide", ids: list.map((t) => t.id) }, () => discardDraftTasks(list.map((t) => t.id)), (out) => announceDiscarded(out.ids, list));
    },
  };

  return <TaskListContext value={api}>{children}</TaskListContext>;
}
