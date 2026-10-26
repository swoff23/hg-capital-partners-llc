"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { CreateForm } from "@/components/create-form";
import { DatePanel, DatePicker } from "@/components/due-date-picker";
import { AssigneePicker, PropertyPicker, UnitPicker } from "@/components/entity-picker";
import type { MenuFollowUp } from "@/components/menu";
import { StatusMenu } from "@/components/status-menu";
import { useToast } from "@/components/toast";
import { Button, FormField, Input, Textarea, tagClass } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { offersUnits, type PropertyOption } from "@/lib/picker-options-shape";
import { firstOccurrence, type RepeatRule } from "@/lib/tasks/repeat";
import { followDueDay } from "@/lib/tasks/repeat-choice";
import { fmtShortDay } from "@/lib/tasks/activity";
import { cn } from "@/lib/utils";
import { createTask, type CreatedTask } from "./actions";

/** A new task starts To do, Scheduled, In progress or Waiting; Review, Done and Canceled come from working it. */
const NOT_NEW: readonly TaskStatus[] = ["REVIEW", "DONE", "CANCELED"];

/** Where New task was opened from: a property or a deal, which the task is about. */
export type NewTaskContext = { kind: "property" | "deal"; id: string; label: string };

type Values = {
  title: string;
  notes: string;
  assignee: AssigneeValue;
  due: Ymd | null;
  repeat: RepeatRule | null;
  taskStatus: TaskStatus;
  waitingOn: string;
  scheduledFor: Ymd | null;
  propertyId: string | null;
  unitLabel: string | null;
  dealId: string | null;
};

const encodeAssignee = (v: AssigneeValue) => (!v ? "" : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);

function blank(context: NewTaskContext | null, meId: string): Values {
  return {
    title: "",
    notes: "",
    assignee: { userId: meId },
    due: null,
    repeat: null,
    taskStatus: "OPEN",
    waitingOn: "",
    scheduledFor: null,
    propertyId: context?.kind === "property" ? context.id : null,
    unitLabel: null,
    dealId: context?.kind === "deal" ? context.id : null,
  };
}

/**
 * New task (forms 4.4): the sheet an intercepting route opens over the list or
 * record you were on, and the same form flat on `/tasks/new` for a pasted
 * link or a reload (`variant`). The context it was opened from is a removable
 * Tag (a deal's task is about the deal, so there's no Property chip beside
 * it); Title, Notes, then the task page's own chips in one row that scrolls
 * sideways and never wraps: Assignee, Due with Repeat inside it, Status with
 * Waiting and Scheduled asking their answer in the same layer, Property and
 * Unit. With a mouse each chip opens a popover over the dialog; on touch it
 * opens as a view inside the sheet.
 *
 * "Create task" with Create more; a task made from the sheet leaves you where
 * you were with "Task created · Open". It posts the same fields the page form
 * did: `assignee` ("u:", "c:" or blank), `dueDate`, `repeatRule` (JSON),
 * `status`, `waitingOn`, `scheduledFor`, `propertyId`, `unitLabel`, `dealId`.
 */
export function NewTaskForm({
  variant,
  users,
  contractors,
  recent,
  properties,
  context,
  meId,
  today,
}: {
  variant: "sheet" | "page";
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  /** The people the viewer assigned last, for the picker's Recent rows. */
  recent: AssigneeValue[];
  properties: PropertyOption[];
  context: NewTaskContext | null;
  meId: string;
  today: Ymd;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(() => blank(context, meId));
  // The context's Tag was removed: the task is about nothing in particular, and the Property chip shows.
  const [tagOn, setTagOn] = useState(context !== null);
  // The last date Due held, so a pinned day follows it even when the field passes through empty.
  const [lastDue, setLastDue] = useState<Ymd | "">("");
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const property = properties.find((p) => p.id === values.propertyId);
  const showProperty = !(tagOn && context);

  function changeDue(next: Ymd | null) {
    if (next) {
      set({ due: next, repeat: followDueDay(values.repeat, lastDue || values.due, next) });
      setLastDue(next);
    } else set({ due: next });
  }

  // A repeat on an undated task dates it to its first occurrence, so a repeating task never starts undated.
  function changeRepeat(rule: RepeatRule | null) {
    if (rule && !values.due) {
      const first = firstOccurrence(rule, today);
      set({ repeat: rule, due: first });
      setLastDue(first);
    } else set({ repeat: rule });
  }

  function changeProperty(propertyId: string | null) {
    const next = properties.find((p) => p.id === propertyId);
    set({ propertyId, unitLabel: values.unitLabel && next?.units.includes(values.unitLabel) ? values.unitLabel : null });
  }

  function followUp(to: TaskStatus): MenuFollowUp | null {
    if (to === "WAITING") {
      return {
        title: "What's it waiting on?",
        content: ({ close, container }) => (
          <WaitingStep
            className={container === "popover" ? "w-80" : undefined}
            initial={values.waitingOn}
            onSave={(reason) => {
              close();
              set({ taskStatus: "WAITING", waitingOn: reason });
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
            value={values.scheduledFor}
            today={today}
            label="Visit date"
            layout={container === "sheet" ? "steps" : "together"}
            // A scheduled job needs a visit date: "No date" is never offered.
            allowNone={false}
            onPick={(date) => {
              close();
              if (date) set({ taskStatus: "SCHEDULED", scheduledFor: date });
            }}
          />
        ),
      };
    }
    return null;
  }

  function pickStatus(to: TaskStatus) {
    // OPEN and IN_PROGRESS commit at once; the answer of the others is theirs to hold.
    set({ taskStatus: to, waitingOn: to === "WAITING" ? values.waitingOn : "", scheduledFor: to === "SCHEDULED" ? values.scheduledFor : null });
  }

  const reason = values.taskStatus === "WAITING" && values.waitingOn ? `Waiting on ${values.waitingOn}` : values.taskStatus === "SCHEDULED" && values.scheduledFor ? `Visit ${fmtShortDay(values.scheduledFor, today)}` : null;

  return (
    <CreateForm<Values, CreatedTask>
      variant={variant}
      title="New task"
      primary="Create task"
      discardTitle="Discard the new task?"
      leaveTitle="Leave the new task?"
      backHref="/tasks"
      createMore
      values={values}
      onRestore={(draft) => {
        // Over a blank form, so a draft kept before a field existed still has every field.
        setValues({ ...blank(context, meId), ...draft });
        // A draft of a task about nothing keeps the Property chip it had.
        setTagOn(context !== null && (draft.propertyId === context.id || draft.dealId === context.id));
      }}
      onReset={() => setValues(blank(tagOn ? context : null, meId))}
      draftKey={`new-task:${context ? `${context.kind}:${context.id}` : "none"}`}
      fields={["title", "description"]}
      check={(data) => {
        const title = String(data.get("title") ?? "").trim();
        if (title.length === 0) return { title: "Enter a title." };
        if (title.length < 2) return { title: "Enter at least 2 characters." };
        return null;
      }}
      action={createTask}
      onCreated={(task, more) => {
        toast({
          message: "Task created",
          action: { label: "Open", onAction: () => router.push(`/tasks/${task.id}`) },
        });
        if (more) return;
        // From the sheet you stay where you were; from a pasted link there's nowhere to go back to, so the task opens.
        if (variant === "sheet") router.back();
        else router.replace(`/tasks/${task.id}`);
      }}
    >
      {({ errors, clear }) => (
        <>
          {context && tagOn && (
            <div>
              <span className={cn(tagClass, "relative max-w-full gap-0.5 pr-0.5")}>
                <span className="truncate">{context.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${context.label}`}
                  onClick={() => {
                    setTagOn(false);
                    set({ propertyId: null, unitLabel: null, dealId: null });
                  }}
                  className="relative flex size-4.5 shrink-0 items-center justify-center rounded-sm text-fg-3 hover:bg-fill-1 hover:text-fg-1 pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            </div>
          )}

          <FormField label="Title" required error={errors.title}>
            {(p) => (
              <Input
                {...p}
                name="title"
                value={values.title}
                onChange={(e) => {
                  clear("title");
                  set({ title: e.target.value });
                }}
                autoComplete="off"
                maxLength={300}
                autoFocus={variant === "page"}
              />
            )}
          </FormField>

          <FormField label="Notes" optional>
            {(p) => (
              <Textarea
                {...p}
                name="description"
                rows={3}
                value={values.notes}
                onChange={(e) => set({ notes: e.target.value })}
                className="field-sizing-content max-h-60 min-h-20"
              />
            )}
          </FormField>

          {/* One row of the task page's own chips; below it the Waiting reason or the visit day. Past the edge they scroll. */}
          <div className="space-y-1">
            <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden">
              <AssigneePicker
                value={values.assignee}
                users={users}
                contractors={contractors}
                meId={meId}
                recent={recent}
                size="sm"
                onChange={(assignee) => set({ assignee })}
              />
              <DatePicker
                value={values.due}
                today={today}
                onChange={changeDue}
                variant="chip"
                withRepeat={{ value: values.repeat, onChange: changeRepeat }}
              />
              <StatusMenu
                kind="task"
                value={values.taskStatus}
                hidden={NOT_NEW.filter((s) => s !== values.taskStatus)}
                followUp={followUp}
                onChange={pickStatus}
                className="shrink-0 border border-line-strong bg-surface px-2 font-medium text-fg-1"
              />
              {showProperty && (
                <PropertyPicker value={values.propertyId} properties={properties} size="sm" onChange={changeProperty} />
              )}
              {property && offersUnits(property.units, values.unitLabel) && (
                <UnitPicker
                  value={values.unitLabel}
                  units={property.units}
                  size="sm"
                  onChange={(unitLabel) => set({ unitLabel })}
                />
              )}
            </div>
            {reason && <p className="truncate text-meta text-fg-3">{reason}</p>}
          </div>

          {/* What the form posts, under the names the server action reads. */}
          <input type="hidden" name="assignee" value={encodeAssignee(values.assignee)} />
          <input type="hidden" name="dueDate" value={values.due ?? ""} />
          <input type="hidden" name="repeatRule" value={values.repeat ? JSON.stringify(values.repeat) : ""} />
          <input type="hidden" name="status" value={values.taskStatus} />
          <input type="hidden" name="waitingOn" value={values.waitingOn} />
          <input type="hidden" name="scheduledFor" value={values.scheduledFor ?? ""} />
          <input type="hidden" name="propertyId" value={values.propertyId ?? ""} />
          <input type="hidden" name="unitLabel" value={values.unitLabel ?? ""} />
          <input type="hidden" name="dealId" value={values.dealId ?? ""} />
        </>
      )}
    </CreateForm>
  );
}

/** Waiting's one question, asked in the status menu's own layer; the status commits only when it's answered. */
function WaitingStep({ initial, onSave, className }: { initial: string; onSave: (reason: string) => void; className?: string }) {
  const [reason, setReason] = useState(initial);
  const ok = reason.trim().length > 0;
  return (
    <form
      noValidate
      className={cn("space-y-3 p-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        // React sends a portaled form's events up to New task's own form: the Enter that answers this must not also send the task.
        e.stopPropagation();
        if (ok) onSave(reason.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.stopPropagation();
      }}
    >
      <Input
        aria-label="What it's waiting on"
        placeholder="City inspection, parts, the tenant"
        value={reason}
        autoFocus
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={!ok}>
          Set to Waiting
        </Button>
      </div>
    </form>
  );
}
