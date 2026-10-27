"use client";
import { useOptimistic, useState } from "react";
import type { TaskStatus } from "@prisma/client";
import { DatePanel } from "@/components/due-date-picker";
import type { MenuFollowUp } from "@/components/menu";
import { Sheet } from "@/components/sheet";
import { StatusMenu } from "@/components/status-menu";
import { Button, Input } from "@/components/ui";
import { useRun } from "@/components/use-run";
import type { Ymd } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/task-scope";
import { isApproval } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { approveTask, undoApprove } from "../list-actions";
import { setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";

/**
 * The status chip at the top of the task page: a menu of the statuses (D6,
 * D6c), `StatusMenu` with its number keys and, on a phone, a titled sheet.
 * Waiting asks what it's waiting on first and Scheduled asks for the visit
 * date, each as a step in the same layer: the status commits only when the
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
}: {
  taskId: string;
  status: TaskStatus;
  waitingOn: string | null;
  scheduledFor: Ymd | null;
  today: Ymd;
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
  function commit(to: TaskStatus, extra: { waitingOn?: string; scheduledFor?: Ymd } = {}) {
    if (isApproval(status, to)) {
      approve();
      return;
    }
    run(() => setTaskStatus(taskId, to, { ...extra, expected: status }), {
      before: () => setShown(to),
      done: `Status set to ${STATUS_LABEL[to]}`,
      key: `task:${taskId}:status`,
      // Back to what it was, if nothing has moved it since. Waiting needs its reason again, and a visit date this change set goes with it.
      undo: () =>
        setTaskStatus(taskId, status, {
          expected: to,
          ...(status === "WAITING" ? { waitingOn } : {}),
          ...(extra.scheduledFor !== undefined ? { scheduledFor } : {}),
        }),
    });
  }

  function followUp(to: TaskStatus): MenuFollowUp | null {
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
        title: "Visit date",
        content: ({ close, container }) => (
          <DatePanel
            // Only a real visit date is the current value: the due date is not a visit.
            value={scheduledFor}
            today={today}
            label="Visit date"
            layout={container === "sheet" ? "steps" : "together"}
            // A scheduled job needs a visit date: "No date" is never offered.
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
      // The mark and word sit on the page's edge; the hover fill reaches past it.
      className="-ml-2.5"
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
        className="max-w-full truncate rounded-sm text-left text-body text-fg-3 transition-colors hover:text-fg-1 pointer-coarse:min-h-11"
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

function WaitingForm({
  initial,
  already,
  onSave,
  className,
}: {
  initial: string;
  already: boolean;
  onSave: (reason: string) => void;
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
          {already ? "Save" : "Set to Waiting"}
        </Button>
      </div>
    </form>
  );
}
