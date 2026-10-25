"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { DueDatePicker } from "@/components/due-date-picker";
import { StatusBadge, StatusMark } from "@/components/status-badge";
import { isActiveStatus } from "@/lib/task-scope";
import { assigneeName, isContractorJob, isOverdue, isTargetLate, targetField, targetOf, type ListTask } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import { useTaskList } from "./task-list-context";

/**
 * One task in a list (Today, All). The whole row opens the task; the
 * checkbox, the date chip and any actions sit above that link. Rows sit flat
 * over hairlines, flush with their section's heading; the hover fill reaches
 * 8px past each side.
 *
 * The date always sits at the right edge (docs/brand-guidelines.md, section
 * 5, Task rows). Two lines on phones and tablets, in any list narrower than
 * 50rem, and on rows with actions: the title with the date chip top right,
 * then the place with the avatar bottom right; the title truncates before
 * the date and the place before the avatar. A row with actions (Needs
 * review) has them beside those two lines from a 480px list up; below that
 * the title, the date and Approve and Send back can't share a line, so the
 * actions take a line of their own under them. One line on a wide desktop
 * list: the title, then fixed columns for the property, the person and the
 * date, so they line up row to row. 50rem keeps the fixed columns
 * (about 500px of them) from squeezing the title: Today's two columns top
 * out under it, so they always keep two lines, and only a full-width list
 * like All goes to one.
 *
 * The status is its mark and one word in a fixed column at the title's end,
 * from a 480px list up. Below that it leads the second line ("Review · 56
 * Tamarack St"), in its tone (docs/brand-guidelines.md, section 9). Red is
 * the overdue date's alone. A canceled title is struck through in --fg-3,
 * like a done one.
 *
 * A contractor's job always shows its status and its Target (D7: the visit
 * date while Scheduled, otherwise Due). Staff tasks show status only when
 * it isn't To do, and their Due date. Must sit inside a TaskListProvider and
 * an `@container` list.
 */
export function TaskRow({
  task,
  checkbox = true,
  avatar = false,
  name = false,
  reason = false,
  status = true,
  actions,
}: {
  task: ListTask;
  checkbox?: boolean;
  /** Show who it's assigned to (lists that mix people). */
  avatar?: boolean;
  /** With the avatar, their first name too, where the row is about that person (Needs review). */
  name?: boolean;
  /** In the Waiting section, under its heading: the pause ring and just what it's waiting on. */
  reason?: boolean;
  /** False where the section already says it (Needs review). */
  status?: boolean;
  /** Buttons at the row's end, e.g. Approve and Send back. */
  actions?: ReactNode;
}) {
  const { today, reschedule, setDone } = useTaskList();
  const job = isContractorJob(task);
  const date = job ? targetOf(task) : task.due;
  const late = job ? isTargetLate(task, today) : isOverdue(task, today);
  const visit = job && targetField(task) === "scheduledFor";
  const who = avatar ? assigneeName(task.assignee) : null;
  const first = name ? who?.split(" ")[0] : null;
  const place = [task.place, task.unitLabel].filter(Boolean).join(" · ");
  const oneLine = !actions;
  const struck = task.checked || task.status === "CANCELED";
  // Waiting with a reason: the pause ring and the reason in --fg-3, so amber
  // stays a partner's decision. Under the Waiting heading the reason alone
  // ("National Fuel"), at every width. Anywhere else the column reads
  // "Waiting on National Fuel"; below 480 the second line has no room for it,
  // so the word leads it like any status and the reason drops.
  const waitingOn = task.status === "WAITING" && task.waitingOn ? task.waitingOn : null;
  const statusColumn = status || reason;
  const badge = status && (job || task.status !== "OPEN") ? <StatusBadge status={task.status} /> : null;
  const waiting = (text: string, label?: string) => (
    // Hit-testable with a mouse, as the avatar is, so the full reason shows on hover above the row's link.
    <span title={`Waiting on ${waitingOn}`} className="inline-flex min-w-0 items-center gap-1.5 text-meta text-fg-3 pointer-fine:pointer-events-auto">
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
  const placeLine = Boolean(narrow || place || who);

  // Top right on the title's line, on every row; a one-line row puts it last.
  const dateChip = (
    <span className={cn("pointer-events-auto flex shrink-0", oneLine && "lg:@min-[50rem]:order-last lg:@min-[50rem]:w-28 lg:@min-[50rem]:justify-end")}>
      <DueDatePicker
        value={date}
        today={today}
        overdue={late}
        label={visit ? "Visit date" : "Due date"}
        isDisabled={!isActiveStatus(task.status)}
        onChange={(to) => reschedule(task, to, job ? "target" : "due")}
      />
    </span>
  );

  return (
    // 40px one-line rows with a mouse (docs/brand-guidelines.md, section 5, Density). Two-line
    // rows are 62px, against the section's 60: the 28px date chip sets the title's line, and
    // the place line under it is 20. Below a 480px list a row's actions wrap to a line of their own.
    <li className={cn("group/row relative flex items-start gap-3 py-1.5", oneLine && "lg:@min-[50rem]:items-center", actions && "flex-wrap")}>
      <Link href={`/tasks/${task.id}`} className="absolute -inset-x-2 inset-y-0 rounded-md transition-colors group-hover/row:bg-fill-1">
        <span className="sr-only">{task.title}</span>
      </Link>

      {checkbox && (
        <TaskCheckbox
          checked={task.checked}
          onChange={(done) => setDone(task, done)}
          label={task.title}
          // Centered on the title's 28px line; a one-line row centers everything.
          className={cn("relative -mt-2", oneLine && "lg:@min-[50rem]:-mt-3")}
        />
      )}

      <div
        className={cn(
          "pointer-events-none relative min-w-0 flex-1",
          oneLine && "lg:@min-[50rem]:flex lg:@min-[50rem]:items-center lg:@min-[50rem]:gap-3",
        )}
      >
        {/* The title's line. On a one-line row its pieces join the row, and the date goes last. */}
        <div className={cn("flex min-w-0 items-center gap-3", oneLine && "lg:@min-[50rem]:contents")}>
          <p className={cn("min-w-0 flex-1 truncate text-body", struck ? "text-fg-3 line-through" : "text-fg-1")}>{task.title}</p>
          {/* The status column: the same width on every row of the list, empty for a staff
              To do. 144px, so "Waiting on" keeps a word of its reason, and 176 on a wide
              one-line list. */}
          {statusColumn && (
            <span className={cn("hidden w-36 shrink-0 @min-[30rem]:flex", oneLine && "lg:@min-[50rem]:w-44")}>{wide}</span>
          )}
          {dateChip}
        </div>
        <div className={cn("mt-0.5 flex min-w-0 items-center gap-2", !placeLine && "hidden", oneLine && "lg:@min-[50rem]:contents")}>
          {narrow && (
            <span className={cn("flex items-center gap-2 @min-[30rem]:hidden", reasonOnly ? "min-w-0 shrink" : "shrink-0")}>
              {narrow}
              {place && (
                <span aria-hidden="true" className="text-meta text-fg-3">
                  ·
                </span>
              )}
            </span>
          )}
          <span
            className={cn(
              // Grows so the avatar sits at the right edge; shrinks alongside a Waiting reason.
              "min-w-0 grow truncate text-meta text-fg-3",
              oneLine && "lg:@min-[50rem]:block lg:@min-[50rem]:w-36 lg:@min-[50rem]:flex-none",
              !place && "hidden",
            )}
          >
            {place}
          </span>
          {avatar && (
            // Bottom right, under the date. The full name shows on hover with a mouse. On touch a
            // tap here opens the row like anywhere else on it, and the task page names the person.
            <span
              title={who ?? undefined}
              className={cn(
                "ml-auto flex items-center gap-1.5 pointer-fine:pointer-events-auto",
                // With a name: it truncates first, and anything still too wide spills off the left, so the avatar holds the edge.
                first ? "min-w-5 shrink justify-end overflow-hidden" : "w-5 shrink-0",
              )}
            >
              {who && (
                <>
                  {/* Where the list has room beside Approve and Send back; phones keep the avatar alone.
                      Before the avatar, so the avatar keeps the corner. */}
                  {first && (
                    <span aria-hidden="true" className="hidden truncate text-meta text-fg-3 @min-[28rem]:block">
                      {first}
                    </span>
                  )}
                  <Avatar name={who} size={20} outline={job} />
                  <span className="sr-only">{who}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {actions && (
        // Beside the two lines from a 480px list up; below that a full-width line, ending at the
        // right edge the date and the avatar share.
        <div className="relative flex w-full shrink-0 items-center justify-end gap-1.5 @min-[30rem]:w-auto @min-[30rem]:self-center">
          {actions}
        </div>
      )}
    </li>
  );
}
