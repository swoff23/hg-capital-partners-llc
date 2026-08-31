"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Td } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
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

// The whole field reads as one button: clicking it opens the picker (an
// invisible <select>/<input> laid over the value), clicking the inset × clears.
// `group/field` lives on the cell so the hover treatment stays field-local.
const fieldBox =
  "relative flex w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors group-hover/field:bg-surface group-hover/field:ring-1 group-hover/field:ring-border";

function shortAddr(a: string) {
  return a.split(",")[0].trim();
}

function ClearX({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative z-10 shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover/field:opacity-100 dark:hover:text-red-400"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Dashed calendar (with a hover +) for tasks that have no due date yet. */
function DueEmptyIcon() {
  return (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
        <rect x="2.5" y="3.5" width="11" height="10" rx="1.75" strokeDasharray="2 1.6" />
        <path d="M5.5 2v2.5M10.5 2v2.5" strokeLinecap="round" />
      </svg>
      <svg
        viewBox="0 0 12 12"
        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-surface text-primary opacity-0 transition-opacity group-hover/field:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        aria-hidden
      >
        <path d="M6 2.5v7M2.5 6h7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// Overlay control covers the value but stops short of the × when one is shown.
const overlay = (hasClear: boolean) =>
  cn("absolute inset-y-0 left-0 cursor-pointer opacity-0", hasClear ? "right-6" : "right-0");

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
  const hasOwner = !!(task.assigneeUserId || task.assigneeName);
  const addressText = task.property
    ? shortAddr(task.property.address)
    : task.deal
      ? `deal · ${shortAddr(task.deal.address)}`
      : null;

  return (
    <tr className={cn("hover:bg-background", pending && "opacity-60")}>
      <Td className="pr-0 align-middle">
        <TaskCheckbox id={task.id} done={task.done} />
      </Td>

      {/* Title — edit in place; the chevron opens the full task */}
      <Td className="align-middle">
        <div className="group/field flex items-center gap-1">
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
          <Tooltip label="Details" className="shrink-0">
            <button
              type="button"
              onClick={() => router.push(`/tasks/${task.id}`)}
              aria-label="Details"
              className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-border/60 hover:text-foreground focus-visible:opacity-100 group-hover/field:opacity-100"
            >
              <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </Td>

      {/* Address — click to pick a property; inset × clears it */}
      {showAddress && (
        <Td className="align-middle text-xs text-muted">
          <div className="group/field flex">
            <Tooltip label={addressText ?? "Set property"} className={fieldBox}>
              <span className="flex-1 truncate">{addressText ?? "—"}</span>
              {task.property && (
                <ClearX label="Clear property" onClick={() => save({ propertyId: null })} />
              )}
              <select
                value={task.property?.id ?? ""}
                onChange={(e) => save({ propertyId: e.target.value || null })}
                aria-label="Property"
                className={overlay(!!task.property)}
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
            </Tooltip>
          </div>
        </Td>
      )}

      {/* Owner — click to reassign; inset × removes it */}
      <Td className="align-middle">
        <div className="group/field flex">
          <Tooltip label={task.assigneeLabel ?? "Assign"} className={fieldBox}>
            <span className="flex flex-1 items-center">
              {task.assigneeLabel ? (
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                    chipColor(task.assigneeLabel),
                  )}
                >
                  {initials(task.assigneeLabel)}
                </span>
              ) : (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-muted">
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path d="M6 3v6M3 6h6" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </span>
            {hasOwner && (
              <ClearX label="Remove owner" onClick={() => save({ assigneeUserId: null })} />
            )}
            <select
              value={task.assigneeUserId ?? ""}
              onChange={(e) => save({ assigneeUserId: e.target.value || null })}
              aria-label="Assignee"
              className={overlay(hasOwner)}
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
          </Tooltip>
        </div>
      </Td>

      {/* Due — click to pick a date; inset × clears it */}
      <Td
        className={cn(
          "whitespace-nowrap align-middle text-xs",
          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted",
        )}
      >
        <div className="group/field flex">
          <Tooltip label={task.dueDate ? fmtDate(task.dueDate) : "Add due date"} className={fieldBox}>
            <span className="flex flex-1 items-center truncate">
              {task.dueDate ? dueLabel(task.dueDate) : <DueEmptyIcon />}
            </span>
            {task.dueDate && (
              <ClearX label="Clear due date" onClick={() => save({ dueDate: null })} />
            )}
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => save({ dueDate: e.target.value || null })}
              aria-label="Due date"
              className={overlay(!!task.dueDate)}
            />
          </Tooltip>
        </div>
      </Td>
    </tr>
  );
}
