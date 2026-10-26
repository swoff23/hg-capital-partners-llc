"use client";
import { useOptimistic, type ReactNode } from "react";
import { KeyRound, Repeat } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { DatePicker } from "@/components/due-date-picker";
import { AssigneePicker, PropertyPicker, UnitPicker } from "@/components/entity-picker";
import { useRun } from "@/components/use-run";
import type { Ymd } from "@/lib/dates";
import { offersUnits, unitDisplay, type PropertyOption } from "@/lib/picker-options-shape";
import { fmtShortDay } from "@/lib/tasks/activity";
import { describeRepeat, repeatDue, type RepeatRule } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";
import { updateTask } from "./actions";

export type { PropertyOption };

export interface TaskFieldValues {
  assignee: AssigneeValue;
  dueDate: Ymd | null;
  scheduledFor: Ymd | null;
  propertyId: string | null;
  unitLabel: string | null;
  repeatRule: RepeatRule | null;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * The task's fields: a sticky rail of label and chip rows on a computer
 * (lg up), a row of chips under the title below that, scrolling sideways on
 * a phone. One set of controls; CSS moves them. In the rail, rows sit flat on
 * hairlines with a 112px label column (docs/brand-guidelines.md, section 5);
 * the page puts the Details heading over them.
 *
 * Every pick saves at once, shows the new value, and toasts what changed with
 * Undo (docs/specs/selectors.md 2, Commit and feedback). Repeat lives inside
 * the due date's panel; the rail keeps a read-only line of what repeats.
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
  meId,
  recent,
  repeatSlot,
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
  /** The signed-in user: first in Team, "(you)", and short names below sm. */
  meId: string;
  /** The people the viewer assigned last, for the picker's Recent rows. */
  recent: AssigneeValue[];
  /** The date the series gave this task when it is a repeat copy, null for a series' first task: the repeat menu's "Next:" steps from it. */
  repeatSlot: Ymd | null;
  /** Set when a contractor is assigned and the property has lockbox codes (D21). */
  lockbox: { state: "shown" | "pick-unit"; contractor: string; hasLogin: boolean } | null;
  created: string;
  className?: string;
}) {
  const { run } = useRun();
  const [v, setOptimistic] = useOptimistic(values, (cur, patch: Partial<TaskFieldValues>) => ({ ...cur, ...patch }));
  const property = properties.find((p) => p.id === v.propertyId);

  /** Saves a patch at once and toasts it with Undo; the toast's `key` makes a quick second edit replace it. */
  function save(
    patch: Partial<TaskFieldValues>,
    opts: { done: string; detail?: string; field: string; undo: Partial<TaskFieldValues> },
  ) {
    run(() => updateTask(taskId, patch), {
      before: () => setOptimistic(patch),
      done: opts.done,
      detail: opts.detail,
      key: `task:${taskId}:${opts.field}`,
      undo: () => updateTask(taskId, opts.undo),
    });
  }

  const nameOf = (a: AssigneeValue): string | null => {
    if (!a) return null;
    if ("userId" in a) {
      if (a.userId === meId) return "you";
      const u = users.find((x) => x.id === a.userId);
      return u ? (u.name || u.email).split(/\s+/)[0] : null;
    }
    const c = contractors.find((x) => x.id === a.contactId);
    return c ? c.name.split(/\s+/)[0] : null;
  };

  function assign(assignee: AssigneeValue) {
    const name = nameOf(assignee);
    run(
      // Sends the assignee this chip showed, so a reassignment from a stale
      // page is refused instead of taking the job off whoever has it now.
      () => updateTask(taskId, { assignee, expectedAssignee: v.assignee }),
      {
        before: () => setOptimistic({ assignee }),
        done: name ? `Assigned to ${name}` : "Unassigned",
        key: `task:${taskId}:assignee`,
        undo: () => updateTask(taskId, { assignee: v.assignee, expectedAssignee: assignee }),
      },
    );
  }

  function changeProperty(propertyId: string | null) {
    const next = properties.find((p) => p.id === propertyId);
    const keepUnit = !!v.unitLabel && !!next?.units.includes(v.unitLabel);
    const dropsUnit = !!v.unitLabel && !keepUnit;
    save(
      { propertyId, ...(keepUnit ? {} : { unitLabel: null }) },
      {
        done: next ? `Property set to ${next.label}` : "Property removed",
        detail: dropsUnit ? "Unit cleared" : undefined,
        field: "property",
        undo: { propertyId: v.propertyId, unitLabel: v.unitLabel },
      },
    );
  }

  const from = v.dueDate ?? today;

  return (
    <div
      className={cn(
        // Below lg: one row of chips. The vertical padding keeps the chips' 44px touch area inside the scroller.
        "-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden",
        "lg:mx-0 lg:block lg:overflow-visible lg:p-0",
        className,
      )}
    >
      <Row label="Assignee">
        <AssigneePicker
          value={v.assignee}
          users={users}
          contractors={contractors}
          meId={meId}
          recent={recent}
          size="sm"
          // The rail's empty fact is a verb.
          placeholder="Assign"
          onChange={assign}
        />
      </Row>
      <Row label="Due">
        <DatePicker
          value={v.dueDate}
          today={today}
          overdue={overdue}
          onChange={(dueDate) =>
            save(
              { dueDate },
              {
                done: dueDate ? `Due date set to ${fmtShortDay(dueDate, today)}` : "Due date cleared",
                field: "due",
                undo: { dueDate: v.dueDate },
              },
            )
          }
          // Repeat lives inside Due (selectors question 7): a Repeat row ends the date panel.
          withRepeat={{
            value: v.repeatRule,
            slot: repeatSlot,
            onChange: (repeatRule) => {
              // A repeat on an undated task dates it to the first occurrence (the service does it too),
              // so the chip shows that date at once and Undo takes it back with the rule.
              const dated = repeatRule && !v.dueDate ? repeatDue(repeatRule, null, today) : null;
              save(
                { repeatRule, ...(dated ? { dueDate: dated } : {}) },
                {
                  done: repeatRule ? `Repeats ${lowerFirst(describeRepeat(repeatRule, { short: true, from }))}` : "Repeat turned off",
                  detail: dated ? `Due ${fmtShortDay(dated, today)}` : undefined,
                  field: "repeat",
                  undo: { repeatRule: v.repeatRule, ...(dated ? { dueDate: null } : {}) },
                },
              );
            },
          }}
        />
      </Row>
      {status === "SCHEDULED" && (
        <Row label="Scheduled">
          <DatePicker
            label="Visit date"
            placeholder="Pick a date"
            prefix={<span className="text-fg-3 lg:hidden">Visit</span>}
            value={v.scheduledFor}
            today={today}
            // A scheduled job needs a visit date: "No date" is never offered.
            allowNone={false}
            onChange={(scheduledFor) =>
              save(
                { scheduledFor },
                {
                  done: scheduledFor ? `Visit set to ${fmtShortDay(scheduledFor, today)}` : "Visit date cleared",
                  field: "visit",
                  undo: { scheduledFor: v.scheduledFor },
                },
              )
            }
          />
        </Row>
      )}
      <Row label="Property">
        <PropertyPicker
          value={v.propertyId}
          properties={properties}
          // The rail's empty fact is a verb.
          placeholder="Add property"
          onChange={changeProperty}
        />
      </Row>
      {property && offersUnits(property.units, v.unitLabel) && (
        <Row label="Unit">
          <UnitPicker
            value={v.unitLabel}
            units={property.units}
            placeholder="Add unit"
            onChange={(unitLabel) =>
              save(
                { unitLabel },
                {
                  done: unitLabel ? `Unit set to ${unitDisplay(unitLabel)}` : "Unit cleared",
                  field: "unit",
                  undo: { unitLabel: v.unitLabel },
                },
              )
            }
          />
        </Row>
      )}
      {v.repeatRule && (
        <Row label="Repeats">
          {/* Read-only: set it inside the due date. relative: the chip row below lg scrolls, and nothing may widen the page. */}
          <span className="relative inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 text-meta text-fg-3 lg:px-0 [&_svg]:size-3.5 [&_svg]:shrink-0">
            <Repeat aria-hidden="true" />
            {describeRepeat(v.repeatRule, { short: true, from })}
          </span>
        </Row>
      )}
      {lockbox && (
        <Row label="Lockbox">
          {/* relative: the sr-only text is absolute, and must stay inside the phone chip row's scroller, not widen the page. */}
          <span className="relative inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 text-meta text-fg-3 lg:items-start lg:whitespace-normal lg:px-0 lg:py-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 lg:[&_svg]:mt-0.5">
            <KeyRound aria-hidden="true" />
            {/* Short so each stays one line in the rail; the full sentence is what's read out. */}
            {lockbox.state === "shown" ? (
              lockbox.hasLogin ? (
                `Shown to ${lockbox.contractor}`
              ) : (
                <>
                  <span aria-hidden="true">Once {lockbox.contractor} signs in</span>
                  <span className="sr-only">{lockbox.contractor} sees the lockbox code after signing in</span>
                </>
              )
            ) : (
              <>
                <span aria-hidden="true">Pick a unit for the code</span>
                <span className="sr-only">Pick a unit so {lockbox.contractor} sees the lockbox code</span>
              </>
            )}
          </span>
        </Row>
      )}
      <Row label="Created" className="hidden lg:flex">
        <span className="block truncate text-meta text-fg-3">{created}</span>
      </Row>
    </div>
  );
}

/** One field: in the rail, a 112px label in --fg-3 and the chip, over a hairline; 40px rows, 48 on touch. */
function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center lg:min-h-10 lg:gap-3 lg:border-b lg:border-line lg:last:border-0 lg:pointer-coarse:min-h-12",
        className,
      )}
    >
      <span className="hidden w-28 shrink-0 text-meta text-fg-3 lg:block">{label}</span>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
