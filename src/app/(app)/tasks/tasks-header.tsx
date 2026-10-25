import { Plus } from "lucide-react";
import { LinkButton, PageHeader } from "@/components/ui";

/** The Tasks page's title and New task. Today is Home now, so there are no tabs. */
export function TasksHeader() {
  return (
    <PageHeader
      title="Tasks"
      actions={
        <LinkButton href="/tasks/new" variant="primary">
          <Plus className="size-4 stroke-[1.5]" aria-hidden="true" />
          New task
        </LinkButton>
      }
    />
  );
}
