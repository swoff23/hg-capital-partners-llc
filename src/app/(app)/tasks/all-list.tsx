"use client";
import { ChevronsUpDown } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SortHeader, listHeadClass } from "@/components/sort-header";
import { isContractorJob, type ListTask } from "@/lib/tasks/list";
import { DEFAULT_TASK_SORT, NO_GROUP, groupKeyOf, personName, type TaskSort } from "@/lib/tasks/list-sort";
import { describeRepeat } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";
import { useTaskList } from "./task-list-context";
import { usePicks } from "./task-picks";
import { TaskRow, hasScheduledColumn, hasStatusColumn } from "./task-row";
import { TaskSection } from "./task-section";

/**
 * The Tasks page's rows, in the server's sort (docs/specs/task-list-sort.md),
 * flat over hairlines with the first cell on the page gutter, as in Today's
 * sections (docs/brand-guidelines.md, section 9: Card is for Home and
 * Overview modules only). Sorted by property (the default) the rows sit under
 * a heading per building, by assignee under a heading per person, by due
 * date in one list. Each heading counts its whole group (`groups`, from the
 * server), so one cut by Show more still reads right. On a wide list the
 * column headers sit on top and sort it. The status column stays only when a
 * row fills it.
 *
 * `scoped`: the list is one property's, under a heading that names it, so
 * there's no building heading and each row's place is its unit alone.
 * `cadence`: the Repeats filter is on, so each row says how it repeats ("Every
 * week on Fri").
 */
export function AllList({
  scoped = false,
  cadence = false,
  sort,
  groups,
}: {
  scoped?: boolean;
  cadence?: boolean;
  sort: TaskSort;
  groups: Record<string, number>;
}) {
  const { tasks } = useTaskList();
  const picks = usePicks();
  const statusColumn = tasks.some((t) => hasStatusColumn(t));
  const scheduledColumn = tasks.some(hasScheduledColumn);
  const field = scoped && sort.field === "property" ? null : sort.field === "due" ? null : sort.field;

  const row = (t: ListTask) => (
    <TaskRow
      key={t.id}
      task={t}
      avatar
      person={field !== "assignee"}
      statusColumn={statusColumn}
      scheduledColumn={scheduledColumn}
      street={!scoped && field !== "property"}
      cadence={cadence && t.repeat ? describeRepeat(t.repeat, { short: true, from: t.due }) : undefined}
    />
  );

  return (
    <div className="@container">
      <TaskColumnHeads statusColumn={statusColumn} scheduledColumn={scheduledColumn} />
      {field === null ? (
        <ul className="@container divide-y divide-border">{tasks.map(row)}</ul>
      ) : (
        <div className="space-y-8 pointer-coarse:space-y-6">
          {runs(tasks, field).map(({ key, rows }) => {
            const first = rows[0];
            const name = field === "assignee" ? personName(first.assignee) : null;
            const title = key === NO_GROUP ? (field === "property" ? "No property" : "Unassigned") : field === "property" ? (first.place ?? "") : (name ?? "");
            const ids = rows.map((t) => t.id);
            const state = picks?.stateOf(ids);
            return (
              <TaskSection
                key={key}
                as={scoped ? "h3" : "h2"}
                title={title}
                count={groups[key] ?? rows.length}
                icon={name ? <Avatar name={name} size={24} outline={isContractorJob(first)} /> : undefined}
                pick={
                  picks && state
                    ? {
                        state,
                        name: groupPickName(field, key === NO_GROUP ? null : title),
                        onToggle: () => picks.setMany(ids, state !== "all"),
                        picking: picks.on,
                      }
                    : undefined
                }
              >
                {rows.map(row)}
              </TaskSection>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What a heading's Select or Deselect picks, said after "Select all": "at 767 Prospect Avenue", "for Zack". */
function groupPickName(field: "property" | "assignee", title: string | null): string {
  if (field === "property") return title ? `at ${title}` : "with no property";
  return title ? `for ${title}` : "unassigned";
}

/**
 * The rows by heading, in the order each heading first appears. The server
 * keeps each group together; while a bulk edit's move or reassign is saving,
 * a changed row sits in its old place with its new key, and it joins its new
 * group here instead of splitting a group in two (two sections with one key).
 */
function runs(tasks: readonly ListTask[], field: "property" | "assignee"): { key: string; rows: ListTask[] }[] {
  const byKey = new Map<string, ListTask[]>();
  for (const t of tasks) {
    const key = groupKeyOf(t, field) ?? NO_GROUP;
    const rows = byKey.get(key);
    if (rows) rows.push(t);
    else byKey.set(key, [t]);
  }
  return [...byKey].map(([key, rows]) => ({ key, rows }));
}

/**
 * The column headers over a wide list (task-list-sort.md 3.2), on the
 * one-line rows' widths so each label sits over its column: nothing over the
 * titles, Status, Property, Unit, Assignee, Scheduled (plain, only when a row has a
 * scheduled day), then Due over the date's right
 * edge. Property, Assignee and Due sort the list; a click flips one already
 * picked. Below the one-line width they drop with the columns, and Sort is in
 * the Filters sheet. `placeholder` draws them inert for the loading screen,
 * which has no FilterScope and doesn't know the sort.
 */
export function TaskColumnHeads({
  statusColumn,
  scheduledColumn = false,
  placeholder = false,
}: {
  statusColumn: boolean;
  /** Some row has a scheduled day: a plain Scheduled heading between Assignee and Due. */
  scheduledColumn?: boolean;
  placeholder?: boolean;
}) {
  const head = (label: string, field: string, className: string, numeric = false) =>
    placeholder ? (
      <span className={cn(listHeadClass, "flex items-center gap-1", numeric && "justify-end", className)}>
        {numeric && <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0" />}
        {label}
        {!numeric && <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0" />}
      </span>
    ) : (
      <SortHeader cell="div" label={label} field={field} defaultSort={DEFAULT_TASK_SORT} numeric={numeric} className={className} />
    );
  return (
    // Sticks under the Tasks filter bar (its height is --list-bar-h), on the page's background, its bottom line the divider.
    <div className="sticky top-[calc(var(--app-bar-h)+var(--list-bar-h,0px))] z-10 hidden items-center gap-3 border-b border-border bg-background pb-2 lg:@min-[60rem]:flex">
      {/* The checkbox's 20px. */}
      <span aria-hidden="true" className="w-5 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1" />
        {statusColumn && <span className={cn(listHeadClass, "w-44 flex-none")}>Status</span>}
        {head("Property", "property", "w-36 flex-none")}
        <span className={cn(listHeadClass, "w-24 flex-none")}>Unit</span>
        {head("Assignee", "assignee", "w-28 flex-none")}
        {scheduledColumn && <span className={cn(listHeadClass, "w-32 flex-none")}>Scheduled</span>}
        {head("Due", "due", "w-30 flex-none", true)}
      </div>
    </div>
  );
}
