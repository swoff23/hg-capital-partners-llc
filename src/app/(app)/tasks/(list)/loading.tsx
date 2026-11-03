import { LoadingScreen, TaskRowSkeleton } from "@/components/skeleton";
import { TaskFiltersPlaceholder } from "../filters";
import { TasksHeader } from "../tasks-header";

/**
 * Tasks while the list loads (docs/specs/performance.md 4.3): the title, New
 * task and the filter bar draw at once, inert, and 12 rows hold the list's
 * place on TaskRow's own boxes. In the list's route group, so a task page
 * doesn't borrow its shape.
 */
export default function TasksLoading() {
  return (
    <LoadingScreen>
      <TasksHeader />
      <TaskFiltersPlaceholder />
      <div className="mt-4">
        <ul className="@container divide-y divide-line">
          {Array.from({ length: 12 }, (_, i) => (
            <TaskRowSkeleton key={i} i={i} />
          ))}
        </ul>
      </div>
    </LoadingScreen>
  );
}
