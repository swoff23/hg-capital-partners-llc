import { TopTabs } from "@/components/nav";
import { LinkButton, PageHeader } from "@/components/ui";

/** Title, New task, and the Today | All tabs (separate routes) on both task lists. */
export function TasksHeader() {
  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <LinkButton href="/tasks/new" variant="primary">
            + New task
          </LinkButton>
        }
      />
      <div className="mb-4">
        <TopTabs
          base="/tasks"
          tabs={[
            { href: "", label: "Today" },
            { href: "/all", label: "All" },
          ]}
        />
      </div>
    </>
  );
}
