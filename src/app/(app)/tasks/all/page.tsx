import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { allTasks, listFilterOptions } from "@/lib/tasks/queries";
import { TaskFilters } from "../filters";
import { TaskListProvider } from "../task-list-context";
import { TasksHeader } from "../tasks-header";
import { AllList } from "./all-list";

const PAGE = 400;

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** All: every task, filtered, Done included, on the same rows as Today. */
export default async function AllTasksPage({ searchParams }: PageProps<"/tasks/all">) {
  const user = await requireUser();
  const sp = await searchParams;

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
        <Card className="mt-4 overflow-hidden">
          {scopedProperty && (
            <CardHeader>
              <Link href={`/properties/${scopedProperty.id}`} className="hover:underline">
                <CardTitle>{shortAddress(scopedProperty.address)}</CardTitle>
              </Link>
            </CardHeader>
          )}
          <TaskListProvider tasks={tasks} today={todayYmdEastern()}>
            <AllList />
          </TaskListProvider>
        </Card>
      )}
      {total > PAGE && (
        <p className="mt-2 text-xs text-muted">
          Showing first {PAGE} of {total}. Narrow the filters to see the rest.
        </p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
