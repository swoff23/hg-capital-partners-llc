"use client";
import { useOptimistic, type ReactNode } from "react";
import { DoorOpen, KeyRound, MapPin } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { AssigneePicker, type AssigneeContractor, type AssigneeUser, type AssigneeValue } from "@/components/assignee-picker";
import { DueDatePicker } from "@/components/due-date-picker";
import { RepeatPicker } from "@/components/repeat-picker";
import type { Ymd } from "@/lib/dates";
import { fmtShortDay } from "@/lib/tasks/activity";
import type { RepeatRule } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";
import { updateTask } from "./actions";
import { SelectChip } from "./select-chip";
import { useRun } from "./use-run";

export type PropertyOption = { id: string; label: string; units: string[] };

export interface TaskFieldValues {
  assignee: AssigneeValue;
  dueDate: Ymd | null;
  scheduledFor: Ymd | null;
  propertyId: string | null;
  unitLabel: string | null;
  repeatRule: RepeatRule | null;
}

/**
 * The task's fields: a sticky rail of label and chip rows on a computer
 * (lg up), a row of chips under the title below that, scrolling sideways on
 * a phone. One set of controls; CSS moves them.
 */
export function TaskFields({
  taskId,
  today,
  status,
  overdue,
  values,
  users,
  contractors,
  properties,
  lockbox,
  created,
  className,
}: {
  taskId: string;
  today: Ymd;
  status: TaskStatus;
  overdue: boolean;
  values: TaskFieldValues;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  properties: PropertyOption[];
  /** Set when a contractor is assigned and the property has lockbox codes (D21). */
  lockbox: { state: "shown" | "pick-unit"; contractor: string } | null;
  created: string;
  className?: string;
}) {
  const { run, toast } = useRun();
  const [v, setOptimistic] = useOptimistic(values, (cur, patch: Partial<TaskFieldValues>) => ({ ...cur, ...patch }));
  const property = properties.find((p) => p.id === v.propertyId);

  function save(patch: Partial<TaskFieldValues>, opts: { done?: string; undo?: Partial<TaskFieldValues> } = {}) {
    run(() => updateTask(taskId, patch), {
      before: () => setOptimistic(patch),
      done: opts.done,
      undo: opts.undo ? () => updateTask(taskId, opts.undo!) : undefined,
    });
  }

  const defaultDay = Number((v.dueDate ?? today).slice(8, 10));

  return (
    <div
      className={cn(
        // Below lg: one row of chips. The vertical padding keeps the chips' 44px touch area inside the scroller.
        "-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden",
        "lg:mx-0 lg:block lg:overflow-visible lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:px-4 lg:py-1 lg:shadow-sm",
        className,
      )}
    >
      <Row label="Assignee">
        <AssigneePicker
          value={v.assignee}
          users={users}
          contractors={contractors}
          onChange={(assignee) => save({ assignee })}
        />
      </Row>
      <Row label="Due">
        <DueDatePicker
          value={v.dueDate}
          today={today}
          overdue={overdue}
          onChange={(dueDate) =>
            save(
              { dueDate },
              { done: dueDate ? `Due date set to ${fmtShortDay(dueDate, today)}` : "Due date cleared", undo: { dueDate: v.dueDate } },
            )
          }
        />
      </Row>
      {status === "SCHEDULED" && (
        <Row label="Scheduled">
          <DueDatePicker
            label="Visit date"
            placeholder="Pick a date"
            prefix={<span className="text-muted lg:hidden">Visit</span>}
            value={v.scheduledFor}
            today={today}
            onChange={(scheduledFor) => {
              if (!scheduledFor) toast({ message: "A scheduled job needs a visit date." });
              else save({ scheduledFor });
            }}
          />
        </Row>
      )}
      <Row label="Property">
        <SelectChip
          label="Property"
          icon={<MapPin aria-hidden="true" />}
          value={v.propertyId}
          options={properties.map((p) => ({ value: p.id, label: p.label }))}
          emptyOption="No property"
          placeholder="No property"
          onChange={(propertyId) => {
            const next = properties.find((p) => p.id === propertyId);
            const keepUnit = !!v.unitLabel && !!next?.units.includes(v.unitLabel);
            save({ propertyId, ...(keepUnit ? {} : { unitLabel: null }) });
          }}
        />
      </Row>
      {property && (property.units.length > 0 || v.unitLabel) && (
        <Row label="Unit">
          <SelectChip
            label="Unit"
            icon={<DoorOpen aria-hidden="true" />}
            value={v.unitLabel}
            // Labels read as written ("Unit 5", "Floor 1 / Lower"); only a bare number gets "Unit".
            options={property.units.map((u) => ({ value: u, label: /^\d+[A-Za-z]?$/.test(u) ? `Unit ${u}` : u }))}
            emptyOption="No unit"
            placeholder="Pick unit"
            onChange={(unitLabel) => save({ unitLabel })}
          />
        </Row>
      )}
      <Row label="Repeats">
        <RepeatPicker
          value={v.repeatRule}
          defaultDay={defaultDay}
          placeholder={
            <>
              <span className="lg:hidden">Repeat</span>
              <span className="hidden lg:inline">Never</span>
            </>
          }
          onChange={(repeatRule) => save({ repeatRule })}
        />
      </Row>
      {lockbox && (
        <Row label="Lockbox">
          <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 text-xs text-muted lg:items-start lg:whitespace-normal lg:px-0 lg:py-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 lg:[&_svg]:mt-px">
            <KeyRound aria-hidden="true" />
            {lockbox.state === "shown"
              ? `Shown to ${lockbox.contractor}`
              : `Pick a unit so ${lockbox.contractor} sees the lockbox code`}
          </span>
        </Row>
      )}
      <Row label="Created" className="hidden lg:flex">
        <span className="block truncate text-xs text-muted">{created}</span>
      </Row>
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center lg:min-h-11 lg:gap-3 lg:border-b lg:border-border/60 lg:last:border-0", className)}>
      <span className="hidden w-[4.5rem] shrink-0 text-xs text-muted lg:block">{label}</span>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
