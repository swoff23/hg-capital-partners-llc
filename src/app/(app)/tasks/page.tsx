import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { EmptyState, Section, TextLink } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { allTasks, listFilterOptions } from "@/lib/tasks/queries";
import { AllList } from "./all-list";
import { TaskFilters } from "./filters";
import { TaskListProvider } from "./task-list-context";
import { TasksHeader } from "./tasks-header";

const PAGE = 400;

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Tasks: every task, filtered, Done included. Today lives on Home now
 * (docs/home-as-today.md), so this opens on the open tasks, and the filters
 * old links carry (?status=done, ?property=…, ?assignee=me) are served here.
 */
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = await searchParams;

  // Today's Contractors column moved to Home with the rest of Today.
  if (sp.view === "contractors") redirect("/?view=contractors");

  // ?assignee=me is the old shortcut for "assigned to me".
  const owner = str(sp.owner) || (sp.assignee === "me" ? `u:${user.id}` : "");
  const current = { status: str(sp.status) || "open", owner, q: str(sp.q), property: str(sp.property) };

  const [{ tasks, total }, options] = await Promise.all([allTasks(current, PAGE), listFilterOptions()]);

  const owners = {
    users: options.users
      .slice()
      .sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : (a.name ?? a.email).localeCompare(b.name ?? b.email)))
      .map((u) => ({ value: `u:${u.id}`, label: (u.name ?? u.email) + (u.id === user.id ? " (me)" : "") })),
    contacts: options.contacts.map((c) => ({ value: `c:${c.id}`, label: c.fullName })),
    external: options.legacyNames.map((n) => ({ value: `n:${n}`, label: n })),
  };

  // Scoped to one property: name it above the list.
  const scopedProperty = current.property ? (options.properties.find((p) => p.id === current.property) ?? null) : null;

  return (
    <>
      <TasksHeader />
      <TaskFilters current={current} owners={owners} properties={options.properties} />

      {tasks.length === 0 ? (
        <div className="mt-4">
          <EmptyState>No tasks match.</EmptyState>
        </div>
      ) : (
        <div className="mt-4">
          <TaskListProvider tasks={tasks} today={todayYmdEastern()}>
            {scopedProperty ? (
              <Section
                title={<TextLink href={`/properties/${scopedProperty.id}`}>{shortAddress(scopedProperty.address)}</TextLink>}
              >
                <AllList scoped />
              </Section>
            ) : (
              <AllList />
            )}
          </TaskListProvider>
        </div>
      )}
      {total > PAGE && (
        <p className="mt-2 text-meta text-fg-3">
          Showing first {PAGE} of {total}. Narrow the filters to see the rest.
        </p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
