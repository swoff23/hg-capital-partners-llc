import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { EmptyState, Section, TextLink } from "@/components/ui";
import { ScopeButton } from "@/components/filter-bar";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { propertyOptions } from "@/lib/picker-options";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { NONE, TASK_PAGE, TASK_PAGE_MAX, parseAllFilters, personRefs, taskLimit, withKnownFilters, withMergedOwners, withoutAssigneeShortcut } from "@/lib/tasks/list-query";
import { allTasks, legacyAssignees, taskFilterCounts, taskViewCounts } from "@/lib/tasks/queries";
import { AllList } from "../all-list";
import { TaskFilters } from "../filters";
import { TaskListProvider } from "../task-list-context";
import { TasksHeader } from "../tasks-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tasks" };

/**
 * Tasks: every task, filtered, Done included. Today lives on Home now
 * (docs/home-as-today.md), so this opens on the open tasks, and the filters
 * old links carry (?status=done, ?property=…) are served here. Two old picks
 * are rewritten to the person's key first, so the bar shows them and can
 * clear them: ?assignee=me, and ?owner=n:<name> once that name is a person.
 * Then a status, person or property the page doesn't have is dropped
 * (withKnownFilters), so ?status=bogus shows Open picked. The bar is
 * components/filter-bar.tsx; its state is the URL, with
 * comma-joined picks for the assignee and property filters.
 */
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;

  // Today's Contractors column moved to Home with the rest of Today.
  if (sp.view === "contractors") redirect("/?view=contractors");

  const filters = parseAllFilters(sp);
  // A page of rows at a time: the first TASK_PAGE, and Show more asks for another (?show=200).
  const take = taskLimit(sp);
  // The people on offer, the imported names and the buildings start beside the session check; all of it is
  // awaited together, so nothing is shown without it.
  const options = assigneeOptions(filters.owner.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)));
  const [user, { users, contractors }, legacy, properties] = await Promise.all([
    requireUser(),
    options,
    // Imported names that are a person on offer count for that person; the rest list once as "Others".
    legacyAssignees(options.then((o) => personRefs(o.users, o.contractors))),
    // An archived property stays on offer while the URL picks it (a property page's "All tasks"),
    // so withKnownFilters below keeps the pick instead of dropping it.
    propertyOptions(filters.property),
  ]);

  const mine = withoutAssigneeShortcut(sp, user.id);
  if (mine) redirect(`/tasks?${mine}`);

  const merged = withMergedOwners(sp, legacy.merged);
  if (merged) redirect(`/tasks?${merged}`);
  // A link naming a status, person or property the page doesn't have drops it, so the bar never shows a raw id.
  const known = withKnownFilters(sp, {
    owner: new Set([...users.map((u) => `u:${u.id}`), ...contractors.map((c) => `c:${c.id}`), ...legacy.others.map((n) => `n:${n}`)]),
    property: new Set(properties.map((p) => p.id)),
  });
  if (known !== null) redirect(known ? `/tasks?${known}` : "/tasks");

  const searching = filters.q !== "";
  const [{ tasks, total }, counts, viewCounts] = await Promise.all([
    allTasks(filters, take, legacy.merged, user.id),
    taskFilterCounts(filters, legacy.merged),
    // While a query is typed, each view counts its hits, so one outside the current view shows.
    searching ? taskViewCounts(filters, legacy.merged) : Promise.resolve(null),
  ]);

  const filtered =
    searching || filters.status !== "open" || filters.owner.length > 0 || filters.property.length > 0 || filters.repeats;
  const narrowed = searching || filters.owner.length > 0 || filters.property.length > 0 || filters.repeats;

  // Scoped to one property: name it above the list.
  const only = filters.property.length === 1 && filters.property[0] !== NONE ? filters.property[0] : null;
  const scopedProperty = only ? (properties.find((p) => p.id === only) ?? null) : null;

  return (
    <>
      <TasksHeader />
      <TaskFilters
        data={{
          users,
          contractors,
          others: legacy.others,
          properties,
          ownerCounts: Object.fromEntries(counts.owner),
          propertyCounts: Object.fromEntries(counts.property),
          meId: user.id,
          viewCounts,
          shown: total,
          hidden: Math.max(0, counts.scope - total),
          filtered,
        }}
      >
        {tasks.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              action={
                narrowed && (
                  <ScopeButton clear>Clear filters</ScopeButton>
                )
              }
            >
              {searching ? `No tasks match “${filters.q}”.` : narrowed ? "No tasks match these filters." : "No tasks match."}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4">
            <TaskListProvider tasks={tasks} today={todayYmdEastern()}>
              {scopedProperty ? (
                <Section
                  title={<TextLink href={`/properties/${scopedProperty.id}`}>{shortAddress(scopedProperty.address)}</TextLink>}
                >
                  <AllList scoped cadence={filters.repeats} />
                </Section>
              ) : (
                <AllList cadence={filters.repeats} />
              )}
            </TaskListProvider>
          </div>
        )}
        {total > take && (
          <div className="mt-4 flex items-center gap-3">
            <p className="text-meta tabular-nums text-fg-3">
              {take < TASK_PAGE_MAX
                ? `Showing ${take} of ${total.toLocaleString("en-US")}`
                : `Showing first ${TASK_PAGE_MAX} of ${total.toLocaleString("en-US")}. Narrow the filters to see the rest.`}
            </p>
            {take < TASK_PAGE_MAX && <ScopeButton changes={{ show: String(take + TASK_PAGE) }}>Show more</ScopeButton>}
          </div>
        )}
      </TaskFilters>
    </>
  );
}

export const dynamic = "force-dynamic";
