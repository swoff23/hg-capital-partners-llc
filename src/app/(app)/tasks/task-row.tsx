"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { DueDatePicker } from "@/components/due-date-picker";
import { LinkPending } from "@/components/link-pending";
import { pendingRowFill } from "@/components/ui";
import { StatusBadge, StatusMark } from "@/components/status-badge";
import { isActiveStatus } from "@/lib/task-scope";
import { isContractorJob, isOverdue, isTargetLate, targetField, targetOf, type ListTask } from "@/lib/tasks/list";
import { personName, shortName } from "@/lib/tasks/list-sort";
import { cn } from "@/lib/utils";
import { AssigneeCell, assigneeCellPull } from "./assignee-cell";
import { TaskCheckbox } from "./task-checkbox";
import { useTaskList } from "./task-list-context";

/**
 * Whether a row shows anything in the status column: a badge (any task past
 * To do, a contractor's job or a staff task alike, docs/specs/task-list-sort.md
 * 3.5) or a Waiting reason. A list keeps the column when any of its rows does,
 * so the marks line up; with none it drops.
 */
export function hasStatusColumn(task: ListTask, { status = true, reason = false }: { status?: boolean; reason?: boolean } = {}): boolean {
  if (task.status === "WAITING" && task.waitingOn && (status || reason)) return true;
  return status && task.status !== "OPEN";
}

/**
 * One task in a list (Today, All). The whole row opens the task; the
 * checkbox, the date chip and any actions sit above that link, and so does
 * the person where the list offers people (the Tasks page): AssigneeCell
 * reassigns the task from the row. Rows sit flat
 * over hairlines, flush with their section's heading; the hover fill reaches
 * 8px past each side.
 *
 * The date always sits at the right edge (docs/brand-guidelines.md, section
 * 5, Task rows). Two lines on phones and tablets, in any list narrower than
 * 60rem, and on rows with actions: the title with the date chip top right,
 * then the place ("415 Crescent Ave. · Unit 2") with the person bottom right,
 * their first name before their avatar so the avatar holds the corner; the
 * title truncates before the date and the place before the person. A row
 * with actions (Needs review) puts them on a line of their own under those
 * two, at every width, right-aligned to the edge the date and the avatar
 * share, so the date stays top right on every row of a list. One line on a
 * wide desktop list (docs/specs/task-list-sort.md 3.1): the title, then fixed
 * columns for the status, the property, the unit, the person (avatar, then
 * first name) and the date, so they line up row to row under the list's
 * column headers (TaskColumnHeads). How the task repeats sits under its title
 * there. 60rem keeps the fixed columns (about 700px of them) from squeezing
 * the title: Today's two columns top out under it, so they always keep two
 * lines, and only a full-width list like All goes to one.
 *
 * The status is its mark and one word in a fixed column at the title's end,
 * from a 480px list up. Below that it leads the second line ("Review · 56
 * Tamarack St"), in its tone (docs/brand-guidelines.md, section 9). Red is
 * the overdue date's alone. A canceled title is struck through in --muted-foreground,
 * like a done one.
 *
 * A row shows its status once it's past To do (task-list-sort.md 3.5). A
 * contractor's job shows its Target (D7: the visit date while Scheduled,
 * otherwise Due); a staff task its Due date. The status column is the same width
 * on every row of a list, so its marks line up; a list where no row shows a
 * status (staff To dos) passes `statusColumn={false}` (see hasStatusColumn)
 * and its titles get the width back. Must sit inside a TaskListProvider and
 * an `@container` list.
 */
export function TaskRow({
  task,
  checkbox = true,
  avatar = false,
  person = true,
  reason = false,
  status = true,
  statusColumn: listHasStatus = true,
  street = true,
  cadence,
  actions,
  // The list queries mark it (lib/tasks/queries.ts); a caller can still say.
  unread = task.unread ?? false,
}: {
  task: ListTask;
  checkbox?: boolean;
  /** Show who it's assigned to (lists that mix people): a 24px avatar with two initials and their first name. */
  avatar?: boolean;
  /** False under a person's heading, which already names them: a one-line row keeps the empty Assignee column, a two-line row drops the person. */
  person?: boolean;
  /** In the Waiting section, under its heading: the pause ring and just what it's waiting on. */
  reason?: boolean;
  /** False where the section already says it (Needs review). */
  status?: boolean;
  /** False when no row in the list shows a status, so the empty column drops (hasStatusColumn). */
  statusColumn?: boolean;
  /** False under a heading that names the building: the place is the unit alone, and a one-line row's Property cell stays empty. */
  street?: boolean;
  /**
   * How the task repeats ("Every week on Fri"): the Repeats filter
   * (docs/specs/selectors.md, question 10). Under the title on a one-line
   * row; it leads the place line on a two-line one.
   */
  cadence?: string;
  /** Buttons at the row's end, e.g. Approve and Send back. */
  actions?: ReactNode;
  /**
   * Something new since you last opened it (docs/specs/activity-comments.md
   * 2.6, choice 3.5 A): the 8px --primary unread dot hangs in the leading gutter,
   * centered 8px before the row's first column on the title's line, and the
   * row opens the task at its New divider.
   */
  unread?: boolean;
}) {
  const { today, reschedule, setDone, people } = useTaskList();
  const job = isContractorJob(task);
  // The person reassigns from the row where the list offers people (the Tasks page) and the row names them;
  // under a person's heading the heading names them and the cell stays empty.
  const assignable = Boolean(people) && avatar && person;
  const date = job ? targetOf(task) : task.due;
  const late = job ? isTargetLate(task, today) : isOverdue(task, today);
  const visit = job && targetField(task) === "scheduledFor";
  const who = avatar && person ? personName(task.assignee) : null;
  const first = shortName(who);
  const property = street ? task.place : null;
  const place = [property, task.unitLabel].filter(Boolean).join(" · ");
  const oneLine = !actions;
  const struck = task.checked || task.status === "CANCELED";
  // Waiting with a reason: the pause ring and the reason in --muted-foreground, so amber
  // stays a partner's decision. Under the Waiting heading the reason alone
  // ("National Fuel"), at every width. Anywhere else the column reads
  // "Waiting on National Fuel"; below 480 the second line has no room for it,
  // so the word leads it like any status and the reason drops.
  const waitingOn = task.status === "WAITING" && task.waitingOn ? task.waitingOn : null;
  const statusColumn = (status || reason) && listHasStatus;
  const badge = status && task.status !== "OPEN" ? <StatusBadge status={task.status} /> : null;
  const waiting = (text: string, label?: string) => (
    // Under the row's link like the rest of the row, so a click on it opens the task; the link's
    // title carries the full reason on hover. Capped at 160px, so a long one never squeezes out the place.
    <span className="inline-flex min-w-0 max-w-40 items-center gap-1.5 text-meta text-muted-foreground">
      <StatusMark status="WAITING" />
      <span aria-hidden={label ? true : undefined} className="truncate">
        {text}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
  const reasonOnly = waitingOn && reason ? waiting(waitingOn, `Waiting on ${waitingOn}`) : null;
  // The status column, from a 480px list up; and the second line's lead below that.
  const wide = reasonOnly ?? (waitingOn && status ? waiting(`Waiting on ${waitingOn}`) : badge);
  const narrow = reasonOnly ?? badge;

  // The place line: the status lead below a 480px list, the place, the avatar.
  // With none of them the row is the title and its date alone.
  const placeLine = Boolean(narrow || place || who || cadence);
  // A second line at every width; the status lead alone shows only below a 480px list.
  const secondLine = Boolean(place || who || cadence);

  // Top right on the title's line, on every row; a one-line row puts it last.
  const dateChip = (
    // 120px on a one-line row: the widest date, "May 20, 2025", with its padding.
    <span className={cn("pointer-events-auto flex shrink-0", oneLine && "lg:@min-[60rem]:order-last lg:@min-[60rem]:w-30 lg:@min-[60rem]:justify-end")}>
      <DueDatePicker
        value={date}
        today={today}
        overdue={late}
        label={visit ? "Visit date" : "Due date"}
        // Named with the task, so a screen reader hears which one: "Due date for Fix the sink: Apr 19" (TASKS-V02).
        subject={task.title}
        isDisabled={!isActiveStatus(task.status)}
        onChange={(to) => reschedule(task, to, job ? "target" : "due")}
      />
    </span>
  );

  return (
    // 40px one-line rows with a mouse, 48 on touch (docs/brand-guidelines.md, section 5,
    // Density): a title-and-date row takes 10px above and below its 28px line there. Two-line
    // rows are 62px, against the section's 60: the 28px date chip sets the title's line, and
    // the place line under it is 20. A row's actions wrap to a line of their own under both.
    <li
      className={cn(
        "group/row relative flex items-start gap-3 py-1.5 pointer-coarse:min-h-12",
        !secondLine && (narrow ? "@min-[30rem]:pointer-coarse:py-2.5" : "pointer-coarse:py-2.5"),
        oneLine && "lg:@min-[60rem]:items-center",
        actions && "flex-wrap",
      )}
    >
      <Link
        href={unread ? `/tasks/${task.id}#new` : `/tasks/${task.id}`}
        title={waitingOn ? `Waiting on ${waitingOn}` : undefined}
        className={cn("absolute -inset-x-2 inset-y-0 rounded-md transition-colors group-hover/row:bg-muted", pendingRowFill)}
      >
        <span className="sr-only">
          {task.title}
          {unread && ", new updates"}
        </span>
        <LinkPending />
      </Link>

      {unread && (
        // Outside the first column, so checkboxes and titles line up whether or not a row is
        // unread: centered 8px before it (12px to 4px), on the title's 28px line, and lower
        // where a one-line touch row adds its padding.
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -left-3 top-4 size-2 rounded-full bg-primary",
            !secondLine && (narrow ? "@min-[30rem]:pointer-coarse:top-5" : "pointer-coarse:top-5"),
          )}
        />
      )}

      {checkbox && (
        <TaskCheckbox
          checked={task.checked}
          onChange={(done) => setDone(task, done)}
          label={task.title}
          // Centered on the title's 28px line; a one-line row centers everything. A
          // canceled task's ring dims beside its slashed mark but stays tickable:
          // ticking moves it to Done, with Undo back to Canceled (list-actions.ts).
          className={cn("relative -mt-2", oneLine && "lg:@min-[60rem]:-mt-3", task.status === "CANCELED" && "opacity-50")}
        />
      )}

      <div
        className={cn(
          "pointer-events-none relative min-w-0 flex-1",
          oneLine && "lg:@min-[60rem]:flex lg:@min-[60rem]:items-center lg:@min-[60rem]:gap-3",
        )}
      >
        {/* The title's line. On a one-line row its pieces join the row, and the date goes last. */}
        <div className={cn("flex min-w-0 items-center gap-3", oneLine && "lg:@min-[60rem]:contents")}>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-body", struck ? "text-muted-foreground line-through" : "text-foreground")}>{task.title}</p>
            {cadence && oneLine && (
              // Under the title on a one-line row; a two-line row leads its place line with it instead.
              <p className="hidden truncate text-meta text-muted-foreground lg:@min-[60rem]:block">{cadence}</p>
            )}
          </div>
          {/* The status column: the same width on every row of the list, empty for a staff
              To do. 144px, so "Waiting on" keeps a word of its reason, and 176 on a wide
              one-line list. */}
          {statusColumn && (
            <span className={cn("hidden w-36 shrink-0 @min-[30rem]:flex", oneLine && "lg:@min-[60rem]:w-44")}>{wide}</span>
          )}
          {oneLine && (
            // The one-line row's own columns, between the status and the date (task-list-sort.md 3.1):
            // Property 144px, Unit 96 and Assignee 112, the widths TaskColumnHeads labels. Before the
            // date here too, so Tab reaches the Assignee cell before the date, in the order they show.
            <div className="hidden lg:@min-[60rem]:contents">
              <span className="w-36 flex-none truncate text-meta text-muted-foreground">{property}</span>
              <span className="w-24 flex-none truncate text-meta text-muted-foreground">{task.unitLabel}</span>
              {avatar && assignable ? (
                // Reassignable (AssigneeCell): only the trigger takes clicks, so the rest of the cell still opens the task.
                <span className="flex w-28 flex-none items-center">
                  <span title={who ?? undefined} className={cn("flex min-w-0 max-w-full", assigneeCellPull.column)}>
                    <AssigneeCell task={task} layout="column" />
                  </span>
                </span>
              ) : avatar && (
                <span title={who ?? undefined} className="flex w-28 flex-none items-center gap-1.5 overflow-hidden pointer-fine:pointer-events-auto">
                  {who && (
                    <>
                      <Avatar name={who} size={24} outline={job} />
                      <span aria-hidden="true" className="truncate text-meta text-muted-foreground">
                        {first}
                      </span>
                      <span className="sr-only">{who}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
          {dateChip}
        </div>
        {/* 20px tall with or without the avatar, so every two-line row is the same height. */}
        <div className={cn("mt-0.5 flex min-w-0 items-center gap-2", secondLine && "min-h-5", !placeLine && "hidden", oneLine && "lg:@min-[60rem]:hidden")}>
          {narrow && (
            <span className={cn("flex items-center gap-2 @min-[30rem]:hidden", reasonOnly ? "min-w-0 shrink" : "shrink-0")}>
              {narrow}
              {(place || cadence) && (
                <span aria-hidden="true" className="text-meta text-muted-foreground">
                  ·
                </span>
              )}
            </span>
          )}
          {cadence && (
            // Shrinks, its words truncating, so a long rule never pushes the avatar off a narrow row.
            <span className="flex min-w-0 shrink items-center gap-2 text-meta text-muted-foreground">
              <span className="truncate">{cadence}</span>
              {place && <span aria-hidden="true">·</span>}
            </span>
          )}
          <span
            className={cn(
              // Grows so the person sits at the right edge; shrinks alongside a Waiting reason.
              "min-w-0 grow truncate text-meta text-muted-foreground",
              !place && "hidden",
            )}
          >
            {place}
          </span>
          {who && assignable ? (
            // Bottom right, under the date, reassignable (AssigneeCell). The full name shows on hover with a mouse.
            <span title={who} className={cn("ml-auto flex min-w-6 shrink justify-end", assigneeCellPull.corner)}>
              <AssigneeCell task={task} layout="corner" />
            </span>
          ) : who && (
            // Bottom right, under the date. The full name shows on hover with a mouse. On touch a
            // tap here opens the row like anywhere else on it, and the task page names the person.
            <span
              title={who}
              // The name truncates first, so the avatar holds the edge. No overflow clip here: the avatar overhangs the line.
              className="ml-auto flex min-w-6 shrink items-center justify-end gap-1.5 pointer-fine:pointer-events-auto"
            >
              {/* Before the avatar, so the avatar keeps the corner. */}
              <span aria-hidden="true" className="truncate text-meta text-muted-foreground">
                {first}
              </span>
              {/* 24px, so two people who share a first letter stay apart; it overhangs the 20px line by 2px each way. */}
              <Avatar name={who} size={24} outline={job} className="-my-0.5" />
              <span className="sr-only">{who}</span>
            </span>
          )}
        </div>
      </div>

      {actions && (
        // A full-width line under the two, ending at the right edge the date and the avatar share.
        <div className="relative flex w-full shrink-0 items-center justify-end gap-1.5">{actions}</div>
      )}
    </li>
  );
}
