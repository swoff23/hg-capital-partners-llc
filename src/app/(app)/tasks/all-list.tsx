"use client";
import { useTaskList } from "./task-list-context";
import { TaskRow, hasStatusColumn } from "./task-row";

/**
 * The Tasks page's rows, in the server's order (soonest due first), flat
 * over hairlines with the first cell on the page gutter, as in Today's
 * sections (docs/brand-guidelines.md, section 9: Card is for Home and
 * Overview modules only). The status column stays only when a row fills it.
 * `scoped`: the list is one property's, under a heading that names it, so
 * each row's place is its unit alone.
 */
export function AllList({ scoped = false }: { scoped?: boolean }) {
  const { tasks } = useTaskList();
  const statusColumn = tasks.some((t) => hasStatusColumn(t));
  return (
    <ul className="@container divide-y divide-line">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} avatar statusColumn={statusColumn} street={!scoped} />
      ))}
    </ul>
  );
}
