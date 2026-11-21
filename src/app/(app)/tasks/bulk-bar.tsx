"use client";
import { useMemo, useState } from "react";
import { Building2, CalendarDays, CircleDashed, Trash2, UserRound, X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { ActionBar } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePanel, warmDatePanel } from "@/components/due-date-picker";
import { NO_PROPERTY, assigneeKeyOf, assigneeValueOfKey, propertyRows } from "@/components/entity-picker";
import { OptionList } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { StatusMenu } from "@/components/status-menu";
import { useToast } from "@/components/toast";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import { unitAfterMove, type PropertyOption } from "@/lib/picker-options-shape";
import { isActiveStatus } from "@/lib/task-scope";
import { assignLine, deleteBody, deleteTitle, deletedLine, dueLine, emailsDetail, propertyLine, statusLine, tasksCount, undoLine, type BulkLine } from "@/lib/tasks/bulk-copy";
import { assigneeName, assigneeValueOf, type ListPatch, type ListTask } from "@/lib/tasks/list";
import { shortName } from "@/lib/tasks/list-sort";
import { cn } from "@/lib/utils";
import { WaitingForm } from "./[id]/status-control";
import { bulkAssign, bulkDelete, bulkDue, bulkProperty, bulkStatus, undoBulkAssign, undoBulkDue, undoBulkProperty, undoBulkStatus } from "./list-actions";
import type { AssignChange, PropertyChange, StatusChange } from "@/lib/tasks/bulk-core";
import { listAssigneeOf, useTaskList } from "./task-list-context";
import { usePicks, type PicksApi } from "./task-picks";

/**
 * The Tasks list's bulk bar (docs/specs/bulk-edit.md): docked at the bottom
 * (ActionBar `placement="app"`) while any row is picked. From 800px of bar
 * width it reads "3 selected", then Status, Assignee, Due date, Property and
 * Delete as small buttons with a label, and Clear at the end; below that, an
 * × with the count (Clear) and the five as 44px icons, named for screen
 * readers. Each opens the task page's own picker (a popover with a mouse, a
 * titled sheet on a touch phone) and applies to every picked task at once:
 * the rows change at once, the server runs each task through its own rules,
 * and one toast says what happened, what it skipped and why, with Undo.
 * Delete asks first and has none. The ticks stay after an edit.
 */

/** Every bulk toast shares a key, so a second edit's replaces the first's. */
const KEY = "tasks:bulk";

const many = (patches: ListPatch[]): ListPatch => ({ kind: "many", patches });

/** The one value every picked task shares, or null when they differ. */
function shared<T>(list: readonly ListTask[], of: (t: ListTask) => T): T | null {
  const first = of(list[0]);
  return list.every((t) => of(t) === first) ? first : null;
}

/** Whether every picked task has the same value, null included. */
function agree<T>(list: readonly ListTask[], of: (t: ListTask) => T): boolean {
  const first = of(list[0]);
  return list.every((t) => of(t) === first);
}

export function BulkBar({ properties }: { properties: PropertyOption[] }) {
  const picks = usePicks();
  const n = picks?.picked.length ?? 0;
  // Whether anything has been picked since the page loaded, so clearing says so and a fresh page says nothing.
  const [pickedOnce, setPickedOnce] = useState(false);
  if (n > 0 && !pickedOnce) setPickedOnce(true);
  return (
    <>
      {/* The count for screen readers, mounted before the first pick so going from none to one is announced. */}
      <span role="status" className="sr-only">
        {n > 0 ? `${n} selected` : pickedOnce ? "Selection cleared" : ""}
      </span>
      {/* The bar mounts only while something is picked, so its pickers and the Delete dialog start closed each time. */}
      {picks?.on && <Bar properties={properties} picks={picks} />}
    </>
  );
}

function Bar({ properties, picks }: { properties: PropertyOption[]; picks: PicksApi }) {
  const { people, peopleRows, today, runEdit } = useTaskList();
  const { toast } = useToast();
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const placeRows = useMemo(() => propertyRows({ properties }), [properties]);

  const list = picks.picked;
  const n = list.length;
  const count = tasksCount(n);

  /**
   * One toast for the change: what it did, with Undo when anything changed. Its second clause is a refusal's own
   * words when a rule refused a task (what happened and what to do), else why some were skipped, else `extra`
   * (who gets emails).
   */
  function said(line: BulkLine, undo: (() => void) | null, refusal?: string, extra?: string) {
    const detail = refusal ?? line.detail ?? extra;
    toast({ ...line, key: KEY, ...(detail ? { detail } : {}), ...(undo ? { action: { label: "Undo", onAction: undo } } : {}) });
  }
  /** After an Undo: quiet when everything went back, otherwise what didn't and why. */
  function putBack(r: { done: number; skipped: Parameters<typeof undoLine>[1] }) {
    const line = undoLine(r.done, r.skipped);
    if (line) toast({ ...line, key: KEY });
  }
  /** The rows as they were, for an Undo's optimistic patch. */
  const restore = (items: ListTask[], ids: readonly { id: string }[]) =>
    many(items.filter((t) => ids.some((c) => c.id === t.id)).map((task) => ({ kind: "restore", task })));

  // ---- Status ----
  function setStatus(to: TaskStatus, extra: { waitingOn?: string; scheduledFor?: Ymd } = {}) {
    const items = list;
    runEdit(
      many(items.map((t) => ({ kind: "status", id: t.id, status: to }))),
      () => bulkStatus(items.map((t) => ({ id: t.id, expected: t.status })), to, extra),
      (res) => said(statusLine(res.done, to, res.skipped), res.changed.length ? () => undoStatus(res.changed, items) : null, res.refusal),
    );
  }
  function undoStatus(changes: StatusChange[], items: ListTask[]) {
    runEdit(restore(items, changes), () => undoBulkStatus(changes), putBack);
  }
  // Review means "a contractor says it's done": offered when every pick has a contractor, or is in Review already.
  const reviewable = list.every((t) => t.assignee?.kind === "contact" || t.status === "REVIEW");

  // ---- Assignee ----
  const assigneeKey = shared(list, (t) => (t.assignee?.kind === "name" ? null : assigneeKeyOf(assigneeValueOf(t.assignee))));
  function assign(key: string) {
    if (!people) return;
    const to = assigneeValueOfKey(key);
    const next = listAssigneeOf(to, people);
    const who = to && "userId" in to && to.userId === people.meId ? "you" : (shortName(assigneeName(next)) ?? "them");
    const items = list;
    runEdit(
      many(items.map((t) => ({ kind: "assignee", id: t.id, assignee: next }))),
      () => bulkAssign(items.map((t) => ({ id: t.id, expected: assigneeValueOf(t.assignee) })), to),
      (res) =>
        said(
          assignLine(res.done, to ? who : null, res.skipped),
          res.changed.length ? () => undoAssign(res.changed, items) : null,
          res.refusal,
          res.emails ? emailsDetail(who, res.emails) : undefined,
        ),
    );
  }
  function undoAssign(changes: AssignChange[], items: ListTask[]) {
    runEdit(restore(items, changes), () => undoBulkAssign(changes), putBack);
  }

  // ---- Due date ----
  // What each row's date chip shows: the due date, jobs included. A bulk date edit always moves Due.
  const shownDate = (t: ListTask) => t.due;
  const dueShared = shared(list, shownDate);
  const dueMixed = !agree(list, shownDate);
  function moveTo(to: Ymd | null) {
    const items = list;
    const changes = items
      .filter((t) => isActiveStatus(t.status))
      .map((t) => ({ id: t.id, field: "dueDate" as const, value: to }));
    runEdit(
      { kind: "dates", changes },
      () => bulkDue(items.map((t) => t.id), to),
      (res) =>
        said(
          dueLine(res.done, to, res.skipped),
          res.changed.length ? () => runEdit({ kind: "dates", changes: res.changed }, () => undoBulkDue(res.changed), putBack) : null,
        ),
    );
  }

  // ---- Property ----
  const placeKey = shared(list, (t) => t.propertyId ?? NO_PROPERTY);
  function move(key: string) {
    const propertyId = key === NO_PROPERTY ? null : key;
    const property = propertyId ? (properties.find((p) => p.id === propertyId) ?? null) : null;
    const items = list;
    runEdit(
      many(
        // A task already on that building keeps its unit, as the server leaves it.
        items
          .filter((t) => t.propertyId !== propertyId)
          .map((t) => ({
            kind: "place",
            id: t.id,
            propertyId,
            place: property?.label ?? null,
            unitLabel: property ? unitAfterMove(t.unitLabel, property.units) : null,
          })),
      ),
      () => bulkProperty(items.map((t) => t.id), propertyId),
      (res) => said(propertyLine(res.done, property?.label ?? null, res.skipped), res.changed.length ? () => undoMove(res.changed, items) : null, res.refusal),
    );
  }
  function undoMove(changes: PropertyChange[], items: ListTask[]) {
    runEdit(restore(items, changes), () => undoBulkProperty(changes), putBack);
  }

  // ---- Delete ----
  async function remove() {
    const ids = list.map((t) => t.id);
    setDeleting(true);
    const result = await callAction(() => bulkDelete(ids));
    setDeleting(false);
    setConfirming(false);
    if (!result.ok) {
      toast({ message: result.error, key: KEY });
      return;
    }
    toast({ ...deletedLine(result.data.deleted, result.data.failed), key: KEY });
    picks.clear();
  }

  // From 800px of bar width the labels fit with a mouse and with touch's larger type (the labeled row needs about
  // 705px with a mouse); below that, a 44px icon each, its label for screen readers.
  const tool = cn(buttonClass({ variant: "secondary", size: "sm" }), "@max-[50rem]:h-11 @max-[50rem]:w-11 @max-[50rem]:px-0");
  const label = "@max-[50rem]:sr-only";
  const icon = "size-4";

  return (
    <>
      <ActionBar
        placement="app"
        // The page column's 1600px of content, so Clear ends where the rows do on a wide screen.
        contentClassName="box-content max-w-400"
        rowClassName="lg:justify-start"
        // Its own pickers hold fields (the people and property searches, Waiting's reason): on a touch tablet the
        // bar stays laid out under the keyboard, so the popover keeps its anchor.
        hideWithKeyboard={false}
        actions={
          <div className="@container min-w-0 flex-1">
            {/* 2px between the icons below 800px, so at 320 the count keeps three digits beside them. */}
            <div className="flex items-center gap-0.5 @min-[50rem]:gap-2">
              {/* Phone: the × with the count clears, and takes the room the icons leave. */}
              <button
                type="button"
                onClick={picks.clear}
                aria-label={`Clear ${n} selected`}
                className={cn(
                  buttonClass({ variant: "ghost", size: "sm" }),
                  "hidden min-w-0 flex-1 justify-start gap-1 px-1.5 @max-[50rem]:inline-flex pointer-coarse:min-h-11",
                )}
              >
                {/* At 320 three digits need the ×'s room: the button's name still says Clear. */}
                <X aria-hidden="true" className={cn(icon, n >= 100 && "max-[339px]:hidden")} />
                <span className="truncate tabular-nums text-foreground">{n}</span>
              </button>
              <span aria-hidden="true" className="mr-1 shrink-0 text-body text-foreground tabular-nums @max-[50rem]:hidden">
                {n} selected
              </span>

              <StatusMenu
                kind="task"
                value={shared(list, (t) => t.status)}
                title={`Status · ${count}`}
                hidden={reviewable ? [] : ["REVIEW"]}
                onChange={(to) => setStatus(to)}
                followUp={(to) =>
                  to === "WAITING"
                    ? {
                        title: "What's it waiting on?",
                        content: ({ close, container }) => (
                          <WaitingForm
                            className={container === "popover" ? "w-80" : undefined}
                            initial={shared(list, (t) => t.waitingOn) ?? ""}
                            already={false}
                            submitLabel={`Set ${n} to Waiting`}
                            onSave={(reason) => {
                              close();
                              setStatus("WAITING", { waitingOn: reason });
                            }}
                          />
                        ),
                      }
                    : to === "SCHEDULED"
                      ? {
                          title: "Scheduled day",
                          content: ({ close, container }) => (
                            <DatePanel
                              value={shared(list, (t) => t.scheduledFor)}
                              today={today}
                              label="Scheduled day"
                              layout={container === "sheet" ? "steps" : "together"}
                              // A scheduled job needs a scheduled day: "No date" is never offered.
                              allowNone={false}
                              onPick={(date) => {
                                close();
                                if (date) setStatus("SCHEDULED", { scheduledFor: date });
                              }}
                            />
                          ),
                        }
                      : null
                }
                trigger={
                  <AriaButton className={tool}>
                    <CircleDashed aria-hidden="true" className={icon} />
                    <span className={label}>Status</span>
                  </AriaButton>
                }
              />

              {peopleRows && (
                <PickerLayer
                  isOpen={assigneeOpen}
                  onOpenChange={setAssigneeOpen}
                  title={`Assignee · ${count}`}
                  placement="top start"
                  popoverClassName="min-w-64 max-w-80"
                  trigger={
                    <AriaButton className={tool}>
                      <UserRound aria-hidden="true" className={icon} />
                      <span className={label}>Assignee</span>
                    </AriaButton>
                  }
                >
                  {({ container, close }) => (
                    <OptionList
                      aria-label="Assignee"
                      container={container}
                      pinned={peopleRows.pinned}
                      sections={peopleRows.sections}
                      selectedKey={assigneeKey}
                      onPick={(key) => {
                        close();
                        if (key !== assigneeKey) assign(key);
                      }}
                      onTab={close}
                      searchLabel="Search people"
                      emptyText="No one matches."
                    />
                  )}
                </PickerLayer>
              )}

              <PickerLayer
                isOpen={dueOpen}
                onOpenChange={setDueOpen}
                title={`Due date · ${count}`}
                placement="top start"
                motion="pop"
                besideWhenShort
                trigger={
                  <AriaButton className={tool} onHoverStart={warmDatePanel} onFocus={warmDatePanel} onPressStart={warmDatePanel}>
                    <CalendarDays aria-hidden="true" className={icon} />
                    <span className={label}>Due date</span>
                  </AriaButton>
                }
              >
                {({ container, close }) => (
                  <DatePanel
                    value={dueShared}
                    mixed={dueMixed}
                    today={today}
                    label="Due date"
                    layout={container === "sheet" ? "steps" : "together"}
                    allowNone
                    onPick={(to) => {
                      close();
                      if (dueMixed || to !== dueShared) moveTo(to);
                    }}
                  />
                )}
              </PickerLayer>

              <PickerLayer
                isOpen={propertyOpen}
                onOpenChange={setPropertyOpen}
                title={`Property · ${count}`}
                placement="top start"
                popoverClassName="min-w-64 max-w-80"
                trigger={
                  <AriaButton className={tool}>
                    <Building2 aria-hidden="true" className={icon} />
                    <span className={label}>Property</span>
                  </AriaButton>
                }
              >
                {({ container, close }) => (
                  <OptionList
                    aria-label="Property"
                    container={container}
                    pinned={placeRows.pinned}
                    items={placeRows.items}
                    selectedKey={placeKey}
                    onPick={(key) => {
                      close();
                      if (key !== placeKey) move(key);
                    }}
                    onTab={close}
                    searchLabel="Search properties"
                    emptyText="No property matches."
                  />
                )}
              </PickerLayer>

              <button
                type="button"
                onClick={() => setConfirming(true)}
                // The first step of a destructive action: the danger look, sized like the others.
                className={cn(buttonClass({ variant: "danger", size: "sm" }), "@max-[50rem]:h-11 @max-[50rem]:w-11 @max-[50rem]:px-0")}
              >
                <Trash2 aria-hidden="true" className={icon} />
                <span className={label}>Delete</span>
              </button>

              <button
                type="button"
                onClick={picks.clear}
                className={cn(buttonClass({ variant: "ghost", size: "sm" }), "ml-auto @max-[50rem]:hidden")}
              >
                <X aria-hidden="true" className={icon} />
                Clear
              </button>
            </div>
          </div>
        }
      />
      {confirming && (
        <ConfirmDialog
          title={deleteTitle(n)}
          body={deleteBody(n)}
          busy={deleting}
          onClose={() => setConfirming(false)}
          actions={
            <Button variant="destructive" size="sm" pending={deleting} onClick={remove}>
              Delete {count}
            </Button>
          }
        />
      )}
    </>
  );
}
