"use client";
import { useOptimistic, useState } from "react";
import type { TaskStatus } from "@prisma/client";
import { DatePanel } from "@/components/due-date-picker";
import type { MenuFollowUp } from "@/components/menu";
import { Sheet } from "@/components/sheet";
import { StatusMenu } from "@/components/status-menu";
import { Button, Input, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import type { Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { STATUS_LABEL } from "@/lib/task-scope";
import { isApproval } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { approveTask, undoApprove } from "../list-actions";
import { setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";

/**
 * The status chip at the top of the task page: a menu of the statuses (D6,
 * D6c), `StatusMenu` with its number keys and, on a phone, a titled sheet.
 * Waiting asks what it's waiting on first and Scheduled asks for the scheduled
 * day, each as a step in the same layer: the status commits only when the
 * question is answered, and Back or Esc leaves it as it was. Every change
 * toasts with Undo. Review is offered only when a contractor is assigned or
 * the task is already in Review (BTASKS-041). While Waiting, WaitingReason
 * shows the reason under the title.
 */
export function StatusControl({
  taskId,
  status,
  waitingOn,
  scheduledFor,
  today,
  hasContractor,
  residentName = null,
}: {
  taskId: string;
  status: TaskStatus;
  waitingOn: string | null;
  scheduledFor: Ymd | null;
  today: Ymd;
  /** A resident sent this (docs/specs/maintenance-requests.md, section 4.2): Canceled asks for a note they see. */
  residentName?: string | null;
  /** A contractor is assigned, so Review (their "done, please look") means something. */
  hasContractor: boolean;
}) {
  const { run, pending, toast } = useStatusRun();
  const [shown, setShown] = useOptimistic(status);

  /**
   * Review to Done is Approve, so its Undo is Approve's Undo (core.ts
   * undoApproval), not a plain move back to Review that emails the contractor
   * and leaves the approval live. The same toast as any status change. The job
   * already Done (the other partner approved first) is a quiet success with
   * nothing to undo.
   */
  function approve() {
    run(() => approveTask(taskId), {
      before: () => setShown("DONE"),
      succeeded: ({ approvedEventId }) => {
        if (!approvedEventId) return;
        toast({
          message: `Status set to ${STATUS_LABEL.DONE}`,
          key: `task:${taskId}:status`,
          action: { label: "Undo", onAction: () => run(() => undoApprove(taskId, approvedEventId)) },
        });
      },
    });
  }

  /** Sends the change with the status this page showed, so a stale page is refused; toasts it with Undo. */
  function commit(to: TaskStatus, extra: { waitingOn?: string; scheduledFor?: Ymd; closedNote?: string } = {}) {
    // Neither end is ever Draft: no menu offers it, and a draft's page shows its banner in place of this control.
    const from = status;
    if (to === "DRAFT" || from === "DRAFT") return;
    if (isApproval(from, to)) {
      approve();
      return;
    }
    run(() => setTaskStatus(taskId, to, { ...extra, expected: from }), {
      before: () => setShown(to),
      done: `Status set to ${STATUS_LABEL[to]}`,
      key: `task:${taskId}:status`,
      // Back to what it was, if nothing has moved it since. Waiting needs its reason again, and a scheduled day this change set goes with it.
      undo: () =>
        setTaskStatus(taskId, from, {
          expected: to,
          ...(from === "WAITING" ? { waitingOn } : {}),
          ...(extra.scheduledFor !== undefined ? { scheduledFor } : {}),
        }),
    });
  }

  function followUp(to: TaskStatus): MenuFollowUp | null {
    if (to === "CANCELED" && residentName) {
      const first = firstName(residentName) || residentName;
      return {
        title: `Close ${first}'s request?`,
        content: ({ close, container }) => (
          <CloseRequestForm
            className={container === "popover" ? "w-80" : undefined}
            first={first}
            onClose={(note) => {
              close();
              commit("CANCELED", { closedNote: note });
            }}
          />
        ),
      };
    }
    if (to === "WAITING") {
      return {
        title: "What's it waiting on?",
        content: ({ close, container }) => (
          <WaitingForm
            className={container === "popover" ? "w-80" : undefined}
            initial={waitingOn ?? ""}
            already={false}
            onSave={(reason) => {
              close();
              commit("WAITING", { waitingOn: reason });
            }}
          />
        ),
      };
    }
    if (to === "SCHEDULED") {
      return {
        title: "Scheduled day",
        content: ({ close, container }) => (
          <DatePanel
            // Only a real scheduled day is the current value: the due date is not one.
            value={scheduledFor}
            today={today}
            label="Scheduled day"
            layout={container === "sheet" ? "steps" : "together"}
            // A scheduled job needs a scheduled day: "No date" is never offered.
            allowNone={false}
            onPick={(date) => {
              close();
              if (date) commit("SCHEDULED", { scheduledFor: date });
            }}
          />
        ),
      };
    }
    return null;
  }

  return (
    <StatusMenu
      kind="task"
      value={shown}
      isDisabled={pending}
      hidden={hasContractor ? [] : ["REVIEW"]}
      onChange={(to) => commit(to)}
      followUp={followUp}
      // Beside Tasks and its slash: the button's own padding is the gap, so pull the ring in a little.
      className="-ml-1"
    />
  );
}

/** "Waiting on city inspection" under the title; tap to change the reason. */
export function WaitingReason({ taskId, waitingOn }: { taskId: string; waitingOn: string }) {
  const { run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-full truncate rounded-sm text-left text-body text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        Waiting on {waitingOn}
      </button>
      <Sheet title="What's it waiting on?" isOpen={open} onOpenChange={setOpen}>
        {({ close }) => (
          <WaitingForm
            className="md:w-96"
            initial={waitingOn}
            already
            onSave={(reason) => {
              close();
              run(() => updateTask(taskId, { waitingOn: reason }));
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/** The question Waiting asks: what it's waiting on. Also the Tasks list's bulk Status (bulk-bar.tsx), with its own `submitLabel`. */
export function WaitingForm({
  initial,
  already,
  onSave,
  submitLabel,
  className,
}: {
  initial: string;
  already: boolean;
  onSave: (reason: string) => void;
  /** In place of "Set to Waiting" or "Save": "Set 3 to Waiting". */
  submitLabel?: string;
  className?: string;
}) {
  const [reason, setReason] = useState(initial);
  const ok = reason.trim().length > 0;
  return (
    <form
      className={cn("space-y-3 p-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(reason.trim());
      }}
    >
      <Input
        aria-label="What it's waiting on"
        placeholder="City inspection, parts, the tenant"
        value={reason}
        autoFocus
        required
        // Free text, not a login: password managers keep their icon and menu off it.
        autoComplete="off"
        data-1p-ignore
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={!ok}>
          {submitLabel ?? (already ? "Save" : "Set to Waiting")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Canceled on a resident's request (docs/specs/maintenance-requests.md, section 4.2; drawing 08 A): an optional note
 * they see on their page and in the email, in place of Done. Blank, they see "Questions? Text us in our group chat."
 */
function CloseRequestForm({ first, onClose, className }: { first: string; onClose: (note: string) => void; className?: string }) {
  const [note, setNote] = useState("");
  return (
    <form
      className={cn("space-y-3 p-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onClose(note.trim());
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-label text-foreground">Note for {first} (optional)</span>
        <Textarea
          rows={3}
          placeholder="Same as your other request."
          value={note}
          autoFocus
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit">Close request</Button>
      </div>
    </form>
  );
}
