import { PageHeader } from "@/components/ui";
import { TasksHeaderActions } from "./select-all";

/** The Tasks page's title and, while rows are picked, bulk edit's Select all (select-all.tsx). New task is in the filter bar (filters.tsx). */
export function TasksHeader() {
  return <PageHeader title="Tasks" actions={<TasksHeaderActions />} />;
}
