"use client";
import { useTaskList } from "./task-list-context";
import { TaskRow } from "./task-row";

/**
 * The Tasks page's rows, in the server's order (soonest due first), flat
 * over hairlines with the first cell on the page gutter, as in Today's
 * sections (docs/brand-guidelines.md, section 9: Card is for Home and
 * Overview modules only).
 */
export function AllList() {
  const { tasks } = useTaskList();
  return (
    <ul className="@container divide-y divide-line">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} avatar />
      ))}
    </ul>
  );
}
