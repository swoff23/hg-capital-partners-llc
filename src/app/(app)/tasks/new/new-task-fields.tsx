"use client";
import { AfterDueMark } from "@/components/after-due-mark";
import { isAfterDue } from "@/lib/tasks/rules";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { CreateForm } from "@/components/create-form";
import { DatePanel, DatePicker } from "@/components/due-date-picker";
import { AssigneePicker, PropertyUnitPicker } from "@/components/entity-picker";
import type { MenuFollowUp } from "@/components/menu";
import { StatusMenu } from "@/components/status-menu";
import { Switch } from "@/components/switch";
import { useToast } from "@/components/toast";
import { Button, FormField, Input, Textarea, tagClass } from "@/components/ui";
import { DropLabel, useDropTarget } from "@/components/upload-queue";
import { callAction, type ActionResult, type FieldErrors } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import type { TaskFill } from "@/lib/missing/checks";
import type { PropertyOption } from "@/lib/picker-options-shape";
import { firstOccurrence, type RepeatRule } from "@/lib/tasks/repeat";
import { followDueDay } from "@/lib/tasks/repeat-choice";
import { fmtShortDay } from "@/lib/tasks/activity";
import { newTaskNotesProblem } from "@/lib/tasks/limits";
import { afterCreate, isStillOnNewTask, newTaskDraftKey } from "@/lib/tasks/new-task";
import { cn } from "@/lib/utils";
import { createTask, discardNewTaskFiles, homeHasTenants, removeNewTaskFile, type CreatedTask } from "./actions";
import { NewTaskChecklist, type NewChecklistItem } from "./new-task-checklist";
import { NewTaskPhotos, newFormId, useNewTaskUploader, type HeldFileView } from "./new-task-photos";

/** What a file dragged over the form says it will do. */
const DROP_LABEL = "Drop to add to the new task";

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
  /** Permission to enter (docs/specs/tenants.md section 8, T11): sent only while the picked home has tenants. */
  entryPermitted: boolean;
  /** The Checklist section's items (docs/specs/new-task-checklist-photos.md), after Make task's. */
  checklist: NewChecklistItem[];
  /** Photos and files that are up and held for Create. */
  files: HeldFileView[];
  /** The form whose files these are, once one was picked: Create attaches them, and the draft brings them back. */
  formId: string | null;
};

const encodeAssignee = (v: AssigneeValue) => (!v ? "" : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);

function blank(context: NewTaskContext | null, meId: string, fill: TaskFill | null = null): Values {
  return {
    title: fill?.title ?? "",
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
    entryPermitted: false,
    checklist: [],
    files: [],
    formId: null,
  };
}

/**
 * New task (forms 4.4): the sheet an intercepting route opens over the list or
 * record you were on, and the same form flat on `/tasks/new` for a pasted
 * link or a reload (`variant`). The context it was opened from is a removable
 * Tag (a deal's task is about the deal, so there's no Property chip beside
 * it); Title, Notes, then the task page's own chips in one row that scrolls
 * sideways and never wraps: Assignee, Due with Repeat inside it, Status with
 * Waiting and Scheduled asking their answer in the same layer, and Property
 * with its Unit in one chip. With a mouse each chip opens a popover over the dialog; on touch it
 * opens as a view inside the sheet.
 *
 * "Create task" with Create more; a task made from the sheet leaves you where
 * you were with "Task created · Open". It posts the same fields the page form
 * did: `assignee` ("u:", "c:" or blank), `dueDate`, `repeatRule` (JSON),
 * `status`, `waitingOn`, `scheduledFor`, `propertyId`, `unitLabel`, `dealId`,
 * and `entryPermitted` while the Permission to enter switch shows and is on.
 *
 * Under Notes, always shown (docs/specs/new-task-checklist-photos.md, Q1 B):
 * Checklist, after Make task's items, posted as `checklist` (JSON), and
 * Photos and files, which upload the moment they're picked, dropped on the
 * form or pasted, under this form's id (`formId`). Create never waits on
 * them: what's up joins the task in its save, and the rest as it lands. The
 * draft keeps both; Discard and Clear delete the files, Create more starts a
 * new form.
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
  fill = null,
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
  /** Missing info's Make task (docs/specs/missing-info.md, D9): the title and the checklist it starts with. */
  fill?: TaskFill | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(() => blank(context, meId, fill));
  // The context's Tag was removed: the task is about nothing in particular, and the Property chip shows.
  const [tagOn, setTagOn] = useState(context !== null);
  // The last date Due held, so a pinned day follows it even when the field passes through empty.
  const [lastDue, setLastDue] = useState<Ymd | "">("");
  // False once the form is gone (Back or a swipe while Create was in flight), so a late success doesn't navigate again.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  // The folder this form's files go up to. A fresh one for every new task; a draft brings its own back.
  const [formId, setFormId] = useState(newFormId);
  // The form Create made a task from: its files are the task's now, so starting over never deletes them.
  const created = useRef<string | null>(null);
  const onHeld = useCallback(
    (file: HeldFileView) => setValues((v) => (v.files.some((f) => f.id === file.id) ? v : { ...v, files: [...v.files, file] })),
    [],
  );
  const { uploader, target } = useNewTaskUploader({ formId, held: values.files.length, onHeld });
  // A file picked, dropped or pasted names the form in the values, so the form is dirty, the draft keeps it, and Create
  // knows whose files to attach. Set while rendering, as React suggests for state that follows other state: once, when
  // the first file shows.
  if (uploader.uploads.length > 0 && values.formId !== formId) setValues((v) => ({ ...v, formId }));

  /** Lets go of the form's files: the ones going up stop, and the held ones go for good, unless Create made a task of them. */
  function dropFiles() {
    const id = values.formId;
    if (!id || created.current === id) return;
    for (const u of uploader.uploads) uploader.remove(u.key);
    void callAction(() => discardNewTaskFiles(id));
  }

  function removeHeld(id: string) {
    setValues((v) => ({ ...v, files: v.files.filter((f) => f.id !== id) }));
    void callAction(() => removeNewTaskFile(id)).then((res) => {
      if (!res.ok) toast({ message: res.error });
    });
  }

  // Files dropped anywhere on the form, or pasted into any field, join Photos and files.
  const zone = useRef<HTMLDivElement>(null);
  const drop = useDropTarget(target, zone, { label: DROP_LABEL });

  // Whether somebody lives in the picked home today, asked again on each pick: the Permission to enter switch shows
  // only then (tenants.md T11). Held with the home it answers for, so a stale answer never shows the switch.
  const [lives, setLives] = useState<{ home: string; yes: boolean } | null>(null);
  const home = values.propertyId ? `${values.propertyId}|${values.unitLabel ?? ""}` : null;
  useEffect(() => {
    if (!values.propertyId) return;
    const asked = `${values.propertyId}|${values.unitLabel ?? ""}`;
    let live = true;
    homeHasTenants(values.propertyId, values.unitLabel).then(
      (yes) => live && setLives({ home: asked, yes }),
      // Unanswered (offline, signed out): no switch, so nothing is saved.
      () => live && setLives({ home: asked, yes: false }),
    );
    return () => {
      live = false;
    };
  }, [values.propertyId, values.unitLabel]);
  const offerEntry = home !== null && lives?.home === home && lives.yes;

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
        title: "Scheduled day",
        content: ({ close, container }) => (
          <DatePanel
            value={values.scheduledFor}
            today={today}
            label="Scheduled day"
            layout={container === "sheet" ? "steps" : "together"}
            // A scheduled job needs a scheduled day: "No date" is never offered.
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

  const reason = values.taskStatus === "WAITING" && values.waitingOn ? `Waiting on ${values.waitingOn}` : values.taskStatus === "SCHEDULED" && values.scheduledFor ? `Scheduled ${fmtShortDay(values.scheduledFor, today)}` : null;

  return (
    <CreateForm<Values, CreatedTask>
      variant={variant}
      // A steady 672px from md (the lg width at full), so the chip row fits with a unit picked and the sheet doesn't grow as you pick (Connor, Nov 14).
      size="lg"
      sheetClassName="md:w-2xl"
      title="New task"
      primary="Create task"
      discardTitle="Discard the new task?"
      leaveTitle="Leave the new task?"
      backHref="/tasks"
      createMore
      values={values}
      onRestore={(draft) => {
        // Over a blank form, so a draft kept before a field existed still has every field.
        setValues({ ...blank(context, meId, fill), ...draft });
        // The draft's files went up under its own form, and any still going come back on its tray.
        if (draft.formId) setFormId(draft.formId);
        // A draft of a task about nothing keeps the Property chip it had.
        setTagOn(context !== null && (draft.propertyId === context.id || draft.dealId === context.id));
      }}
      onReset={() => {
        // Clear on the draft line deletes its files; after Create more they're the task's and stay.
        dropFiles();
        // Back to how it opened, Tag and all: Clear on a draft that had the Tag removed would otherwise lose the context for good.
        setValues(blank(context, meId, fill));
        setTagOn(context !== null);
        setFormId(newFormId());
        created.current = null;
      }}
      onDiscard={dropFiles}
      // A Make task's draft is kept apart from a plain one, under the rows it was made from.
      draftKey={newTaskDraftKey(meId, fill ? { kind: "missing", id: fill.keys.join("+") } : context)}
      fields={["title", "description"]}
      check={(data): FieldErrors | null => {
        const title = String(data.get("title") ?? "").trim();
        if (title.length === 0) return { title: "Enter a title." };
        if (title.length < 2) return { title: "Enter at least 2 characters." };
        const notes = newTaskNotesProblem(String(data.get("description") ?? ""));
        return notes ? { description: notes } : null;
      }}
      action={async (data): Promise<ActionResult<CreatedTask>> => {
        const posted = values.formId;
        const res = await createTask(data);
        if (res.ok && posted) created.current = posted;
        return res;
      }}
      onCreated={(task, more) => {
        // Forms spec 4.4 (TASKS-034), approved by Connor: from the sheet you stay where
        // you were and the toast opens the task; from a pasted link or a reload there's
        // nowhere to go back to, so the page lands on the new task. If the person already
        // left while Create was in flight, nothing navigates; the toast still opens the task.
        const next = afterCreate(variant, more, isStillOnNewTask(mounted.current, window.location.pathname));
        if (next === "replace") {
          toast({ message: "Task created" });
          router.replace(`/tasks/${task.id}`);
          return;
        }
        toast({ message: "Task created", action: { label: "Open", onAction: () => router.push(`/tasks/${task.id}`) } });
        if (next === "back") router.back();
      }}
    >
      {({ errors, clear }) => (
        <div
          ref={zone}
          className="relative"
          onPaste={(e) => {
            // A screenshot pasted into any field goes to Photos and files; text pastes as text.
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              uploader.addFiles(e.clipboardData.files);
            }
          }}
        >
          <div className="space-y-4">
            {context && tagOn && (
              <div>
                <span className={cn(tagClass, "relative max-w-full gap-0.5 pr-0.5")}>
                  <span className="truncate">{context.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${context.label}`}
                    onClick={() => {
                      setTagOn(false);
                      set({ propertyId: null, unitLabel: null, dealId: null, entryPermitted: false });
                    }}
                    className="relative flex size-4.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
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

            {/* Its line is the notes' limit, the one the task page saves within (lib/tasks/limits.ts). */}
            <FormField label="Notes" optional error={errors.description}>
              {(p) => (
                <Textarea
                  {...p}
                  name="description"
                  rows={3}
                  value={values.notes}
                  onChange={(e) => {
                    clear("description");
                    set({ notes: e.target.value });
                  }}
                  className="field-sizing-content max-h-60 min-h-20"
                />
              )}
            </FormField>

            <NewTaskChecklist items={values.checklist} fixed={fill?.items} onChange={(checklist) => set({ checklist })} />

            <NewTaskPhotos uploader={uploader} held={values.files} onRemove={removeHeld} />

            {/* One row of the task page's own chips; below it the Waiting reason or the scheduled day. Past the edge they scroll. */}
            <div className="space-y-1">
              <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden">
                <AssigneePicker
                  value={values.assignee}
                  users={users}
                  contractors={contractors}
                  meId={meId}
                  recent={recent}
                  size="sm"
                  // From md, Assignee and Property give up width first, cutting their names; a phone swipes the row instead.
                  className="md:min-w-24 md:shrink"
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
                  className="shrink-0 border border-line-strong bg-background px-2 font-medium text-foreground"
                />
                {showProperty && (
                  <PropertyUnitPicker
                    propertyId={values.propertyId}
                    unitLabel={values.unitLabel}
                    properties={properties}
                    size="sm"
                    className="md:min-w-32 md:shrink"
                    // A new home starts without Permission to enter (tenants.md T8).
                    onChange={(pick) => set({ ...pick, entryPermitted: false })}
                  />
                )}
              </div>
              {reason && (
                <p className="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
                  <span className="truncate">{reason}</span>
                  {/* The day after Due gets the same warning as everywhere else (docs/specs/contractor-scheduled-date.md, Q4). */}
                  {values.taskStatus === "SCHEDULED" && values.due && isAfterDue(values.scheduledFor, values.due) && <AfterDueMark due={values.due} today={today} />}
                </p>
              )}
            </div>

            {/* Under the chips, once the picked home has tenants; off until it's turned on (tenants.md T11, T13). */}
            {offerEntry && <Switch label="Permission to enter" isSelected={values.entryPermitted} onChange={(entryPermitted) => set({ entryPermitted })} />}

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
            {fill && <input type="hidden" name="missing" value={fill.keys.join(",")} />}
            {offerEntry && values.entryPermitted && <input type="hidden" name="entryPermitted" value="on" />}
            {values.checklist.length > 0 && <input type="hidden" name="checklist" value={JSON.stringify(values.checklist.map((i) => i.title))} />}
            {values.formId && <input type="hidden" name="formId" value={values.formId} />}
          </div>
          {/* Outside the spaced fields, so the drop edge never moves them while a file is dragged over. */}
          <DropLabel state={drop} label={DROP_LABEL} />
        </div>
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
        // Free text, not a login: password managers keep their icon and menu off it.
        autoComplete="off"
        data-1p-ignore
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
