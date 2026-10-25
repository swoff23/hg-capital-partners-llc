"use client";
import { useOptimistic, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { DueDatePicker } from "@/components/due-date-picker";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Sheet } from "@/components/sheet";
import { StatusBadge } from "@/components/status-badge";
import { Button, Input } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";
import { useRun } from "./use-run";

/**
 * The status chip at the top of the task page: a menu of all seven (D6,
 * D6c). Waiting asks what it's waiting on first; Scheduled asks for the
 * visit date. While Waiting, WaitingReason shows the reason under the title.
 */
export function StatusControl({
  taskId,
  status,
  waitingOn,
  scheduledFor,
  dueDate,
  today,
}: {
  taskId: string;
  status: TaskStatus;
  waitingOn: string | null;
  scheduledFor: Ymd | null;
  dueDate: Ymd | null;
  today: Ymd;
}) {
  const { run, pending } = useStatusRun();
  const [shown, setShown] = useOptimistic(status);
  const [sheet, setSheet] = useState<"waiting" | "scheduled" | null>(null);

  function choose(to: TaskStatus) {
    if (to === shown) return;
    if (to === "WAITING") return setSheet("waiting");
    if (to === "SCHEDULED") return setSheet("scheduled");
    run(() => setTaskStatus(taskId, to, { expected: status }), { before: () => setShown(to) });
  }

  return (
    <>
      <MenuTrigger>
        <AriaButton
          aria-label={`Status: ${STATUS_LABEL[shown]}. Change status`}
          isDisabled={pending}
          className={cn(
            "relative inline-flex shrink-0 items-center gap-1 rounded-sm",
            // The 20px badge reaches 44px on touch.
            "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3",
          )}
        >
          <StatusBadge status={shown} />
          <ChevronDown className="size-3.5 text-fg-3" aria-hidden="true" />
        </AriaButton>
        <Menu placement="bottom start" onAction={(key) => choose(key as TaskStatus)}>
          {STATUS_ORDER.map((s) => (
            <MenuItem key={s} id={s} textValue={STATUS_LABEL[s]} checked={s === shown}>
              <StatusBadge status={s} />
            </MenuItem>
          ))}
        </Menu>
      </MenuTrigger>

      <Sheet title="What's it waiting on?" isOpen={sheet === "waiting"} onOpenChange={(o) => !o && setSheet(null)}>
        {({ close }) => (
          <WaitingForm
            initial={waitingOn ?? ""}
            already={shown === "WAITING"}
            onSave={(reason) => {
              close();
              if (shown === "WAITING") run(() => updateTask(taskId, { waitingOn: reason }));
              else run(() => setTaskStatus(taskId, "WAITING", { waitingOn: reason, expected: status }), { before: () => setShown("WAITING") });
            }}
          />
        )}
      </Sheet>

      <Sheet title="Visit date" isOpen={sheet === "scheduled"} onOpenChange={(o) => !o && setSheet(null)}>
        {({ close }) => (
          <ScheduleForm
            initial={scheduledFor ?? dueDate}
            today={today}
            onSave={(date) => {
              close();
              run(() => setTaskStatus(taskId, "SCHEDULED", { scheduledFor: date, expected: status }), { before: () => setShown("SCHEDULED") });
            }}
          />
        )}
      </Sheet>
    </>
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

function WaitingForm({ initial, already, onSave }: { initial: string; already: boolean; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState(initial);
  const ok = reason.trim().length > 0;
  return (
    <form
      className="space-y-3 p-4 md:w-96"
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

function ScheduleForm({ initial, today, onSave }: { initial: Ymd | null; today: Ymd; onSave: (date: Ymd) => void }) {
  const [date, setDate] = useState<Ymd | null>(initial);
  return (
    <form
      className="space-y-3 p-4 md:w-96"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) onSave(date);
      }}
    >
      <DueDatePicker label="Visit date" placeholder="Pick a date" value={date} today={today} onChange={setDate} />
      <div className="flex justify-end">
        <Button type="submit" disabled={!date}>
          Set to Scheduled
        </Button>
      </div>
    </form>
  );
}
