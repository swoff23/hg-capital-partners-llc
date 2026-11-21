"use client";
import type { ReactNode } from "react";
import { useTaskList } from "./task-list-context";

/**
 * The Tasks list, or its empty state, by the rows on screen rather than the
 * server's last answer: after a bulk edit empties the list, its Undo puts the
 * rows back at once, so the list shows them while the server catches up
 * (docs/specs/bulk-edit.md).
 */
export function TasksOrEmpty({ empty, children }: { empty: ReactNode; children: ReactNode }) {
  const { tasks } = useTaskList();
  return tasks.length === 0 ? empty : children;
}
