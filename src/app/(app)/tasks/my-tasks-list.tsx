"use client";
import Link from "next/link";
import { DueDatePicker } from "@/components/due-date-picker";
import { StatusBadge } from "@/components/status-badge";
import { isOverdue } from "@/lib/tasks/list";
import { useTaskList } from "./task-list-context";

/**
 * Home's "My open tasks" rows: title, property, the status chip (when it
 * isn't To do) and the due date chip with quick picks and Undo.
 */
export function MyTasksList() {
  const { tasks, today, reschedule } = useTaskList();
  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
          <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
            {t.title}
          </Link>
          {t.propertyId && t.place && (
            <Link href={`/properties/${t.propertyId}`} className="hidden shrink-0 text-xs text-muted hover:underline sm:block">
              {t.place}
            </Link>
          )}
          {t.status !== "OPEN" && <StatusBadge status={t.status} className="shrink-0" />}
          <DueDatePicker value={t.due} today={today} overdue={isOverdue(t, today)} onChange={(to) => reschedule(t, to, "due")} />
        </li>
      ))}
    </ul>
  );
}
