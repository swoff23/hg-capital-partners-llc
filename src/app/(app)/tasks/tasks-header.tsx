import { PageHeader } from "@/components/ui";
import { TasksHeaderActions } from "./select-all";

/** The Tasks page's title, New task and, while rows are picked, bulk edit's Select all (select-all.tsx). Today is Home now, so there are no tabs. */
export function TasksHeader() {
  return <PageHeader title="Tasks" actions={<TasksHeaderActions />} />;
}
