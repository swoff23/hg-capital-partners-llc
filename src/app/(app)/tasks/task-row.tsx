"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Td } from "@/components/ui";
import { cn, dueLabel, fmtDate, initials } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import { patchTask } from "./actions";

export type TaskRowData = {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null; // yyyy-mm-dd
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeLabel: string | null;
  property: { id: string; address: string } | null;
  deal: { id: string; address: string } | null;
};

const CHIP_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-200",
];
function chipColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}

const quiet =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-border focus:border-primary focus:bg-surface";

function shortAddr(a: string) {
  return a.split(",")[0].trim();
}

export function TaskRow({
  task,
  users,
  properties,
  showAddress,
}: {
  task: TaskRowData;
  users: { id: string; name: string | null; email: string }[];
  properties: { id: string; address: string }[];
  showAddress: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(task.title);

  const save = (data: Parameters<typeof patchTask>[1]) => start(() => patchTask(task.id, data));

  const overdue = !task.done && !!task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <tr className={cn("group hover:bg-background", pending && "opacity-60")}>
      <Td className="pr-0 align-middle">
        <TaskCheckbox id={task.id} done={task.done} />
      </Td>

      {/* Title — edit in place; the arrow opens the full task */}
      <Td className="align-middle">
        <div className="flex items-center gap-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const v = title.trim();
              if (v.length >= 2 && v !== task.title) save({ title: v });
              else if (v.length < 2) setTitle(task.title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(task.title);
                e.currentTarget.blur();
              }
            }}
            className={cn(quiet, "text-sm", task.done && "text-muted line-through")}
          />
          <button
            type="button"
            onClick={() => router.push(`/tasks/${task.id}`)}
            title="Open task"
            aria-label="Open task"
            className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4.5 2.5h5v5M9.5 2.5l-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </Td>

      {/* Address — text label; click the cell to change the property */}
      {showAddress && (
        <Td className="relative align-middle text-xs text-muted">
          <span className="block truncate">
            {task.property
              ? shortAddr(task.property.address)
              : task.deal
                ? `deal · ${shortAddr(task.deal.address)}`
                : "—"}
          </span>
          <select
            value={task.property?.id ?? ""}
            onChange={(e) => save({ propertyId: e.target.value || null })}
            aria-label="Property"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            <option value="">— none</option>
            {task.deal && !task.property && (
              <option value="" disabled>
                deal · {shortAddr(task.deal.address)}
              </option>
            )}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {shortAddr(p.address)}
              </option>
            ))}
          </select>
        </Td>
      )}

      {/* Owner — initials chip; click the cell to reassign */}
      <Td className="relative align-middle">
        <div className="flex items-center">
          {task.assigneeLabel ? (
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                chipColor(task.assigneeLabel),
              )}
              title={task.assigneeLabel}
            >
              {initials(task.assigneeLabel)}
            </span>
          ) : (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted"
              title="Unassigned"
            >
              +
            </span>
          )}
        </div>
        <select
          value={task.assigneeUserId ?? ""}
          onChange={(e) => save({ assigneeUserId: e.target.value || null })}
          aria-label="Assignee"
          title={task.assigneeLabel ?? "Unassigned"}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">Unassigned</option>
          {task.assigneeName && !task.assigneeUserId && (
            <option value="" disabled>
              {task.assigneeName} (external)
            </option>
          )}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
      </Td>

      {/* Due — weekday / date label; click the cell to pick a date */}
      <Td
        className={cn(
          "relative whitespace-nowrap align-middle text-xs",
          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted",
        )}
      >
        <span title={task.dueDate ? fmtDate(task.dueDate) : "No due date"}>
          {task.dueDate ? dueLabel(task.dueDate) : "—"}
        </span>
        <input
          type="date"
          value={task.dueDate ?? ""}
          onChange={(e) => save({ dueDate: e.target.value || null })}
          aria-label="Due date"
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </Td>
    </tr>
  );
}
