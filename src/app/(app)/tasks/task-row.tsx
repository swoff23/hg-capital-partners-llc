"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { DueDatePicker } from "@/components/due-date-picker";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui";
import { isActiveStatus } from "@/lib/task-scope";
import { assigneeName, isContractorJob, isOverdue, isTargetLate, targetField, targetOf, type ListTask } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import { useTaskList } from "./task-list-context";

/**
 * One task in a list (Today, All). The whole row opens the task; the
 * checkbox, the date chip and any actions sit above that link.
 *
 * Two lines (title, then property · status · date) on phones and tablets,
 * in any list narrower than 34rem, and on rows with actions. One line on a
 * wide desktop list: the title with its status chip, then fixed columns for
 * the property, the person and the date, so they line up row to row.
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
  /** In the Waiting section: show what it's waiting on in place of the status. */
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
  // The status chip, or in the Waiting section what it's waiting on.
  const waitingOn = reason && task.status === "WAITING" && !!task.waitingOn;
  const state =
    waitingOn ? (
      <Badge tone="amber" title={`Waiting on ${task.waitingOn}`} className="block max-w-40 truncate">
        {task.waitingOn}
      </Badge>
    ) : status && (job || task.status !== "OPEN") ? (
      <StatusBadge status={task.status} />
    ) : null;

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-background",
        oneLine && "lg:@min-[34rem]:items-center",
      )}
    >
      <Link
        href={`/tasks/${task.id}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      >
        <span className="sr-only">{task.title}</span>
      </Link>

      {checkbox && (
        <TaskCheckbox
          checked={task.checked}
          onChange={(done) => setDone(task, done)}
          label={task.title}
          className="relative"
        />
      )}

      <div
        className={cn(
          "pointer-events-none relative min-w-0 flex-1",
          oneLine && "lg:@min-[34rem]:flex lg:@min-[34rem]:items-center lg:@min-[34rem]:gap-3",
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-2", oneLine && "lg:@min-[34rem]:flex-1")}>
          <p className={cn("min-w-0 flex-1 truncate text-sm", task.checked ? "text-muted line-through" : "text-foreground")}>{task.title}</p>
          {state && oneLine && <span className="hidden shrink-0 lg:@min-[34rem]:flex">{state}</span>}
        </div>
        <div
          className={cn(
            "mt-1.5 flex min-w-0 items-center gap-2",
            oneLine && "lg:@min-[34rem]:mt-0 lg:@min-[34rem]:shrink-0",
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate text-xs text-muted",
              oneLine && "lg:@min-[34rem]:block lg:@min-[34rem]:w-36",
              !place && "hidden",
            )}
          >
            {place}
          </span>
          {state && (
            <span className={cn("flex", waitingOn ? "min-w-0 shrink" : "shrink-0", oneLine && "lg:@min-[34rem]:hidden")}>{state}</span>
          )}
          {avatar && (
            // The full name shows on hover with a mouse. On touch a tap here opens the row like
            // anywhere else on it, and the task page names the person. Beside Approve and Send
            // back on a 320px phone there's only room for the date, so the avatar steps aside.
            <span
              title={who ?? undefined}
              className={cn(
                "items-center gap-1.5 pointer-fine:pointer-events-auto",
                first ? "hidden min-w-5 shrink @min-[20rem]:flex" : "flex w-5 shrink-0",
              )}
            >
              {who && (
                <>
                  <Avatar name={who} size={20} outline={job} />
                  {/* Where the list has room beside Approve and Send back; phones keep the avatar alone. */}
                  {first && (
                    <span aria-hidden="true" className="hidden truncate text-xs text-muted @min-[28rem]:block">
                      {first}
                    </span>
                  )}
                  <span className="sr-only">{who}</span>
                </>
              )}
            </span>
          )}
          <span className={cn("pointer-events-auto flex shrink-0", oneLine && "lg:@min-[34rem]:w-28 lg:@min-[34rem]:justify-end")}>
            <DueDatePicker
              value={date}
              today={today}
              overdue={late}
              label={visit ? "Visit date" : "Due date"}
              isDisabled={!isActiveStatus(task.status)}
              onChange={(to) => reschedule(task, to, job ? "target" : "due")}
            />
          </span>
        </div>
      </div>

      {actions && <div className="relative flex shrink-0 items-center gap-1.5 self-center">{actions}</div>}
    </li>
  );
}
