import { LoadingScreen, TaskRowSkeleton } from "@/components/skeleton";
import { TaskColumnHeads } from "../all-list";
import { TaskFiltersPlaceholder } from "../filters";
import { TasksHeader } from "../tasks-header";

/**
 * Tasks while the list loads (docs/specs/performance.md 4.3): the title, New
 * task and the filter bar draw at once, inert, and 12 rows hold the list's
 * place on TaskRow's own boxes, under the wide list's column headers, drawn
 * inert. In the list's route group, so a task page doesn't borrow its shape.
 */
export default function TasksLoading() {
  return (
    <LoadingScreen>
      <TasksHeader />
      <TaskFiltersPlaceholder />
      <div className="mt-4 @container">
        <TaskColumnHeads statusColumn={false} placeholder />
        <ul className="@container divide-y divide-border">
          {Array.from({ length: 12 }, (_, i) => (
            <TaskRowSkeleton key={i} i={i} />
          ))}
        </ul>
      </div>
    </LoadingScreen>
  );
}
