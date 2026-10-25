"use client";
import { useTaskList } from "../task-list-context";
import { TaskRow } from "../task-row";

/** The All tab's rows, in the server's order (soonest due first), flat over hairlines. */
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
