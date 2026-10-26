"use client";
import { useMemo, type ReactNode } from "react";
import type { AssigneeContractor, AssigneeUser } from "@/components/assignee-picker";
import { assigneeRows, propertyRows } from "@/components/entity-picker";
import { FilterBar, FilterResults, FilterScope, ResultLine, type FilterFacet } from "@/components/filter-bar";
import type { OptionItem } from "@/components/option-list";
import type { PropertyOption } from "@/lib/picker-options-shape";
import type { TaskView } from "@/lib/tasks/list-query";
import { countTasksAction } from "./filter-actions";

const VIEWS: { key: TaskView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

/** Open is the list's opening view, so it stays out of the URL. */
const DEFAULTS = { status: "open" } as const;

export type TaskFilterData = {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  /** Imported names that stand for nobody the list can name: one "Others" group. */
  others: string[];
  properties: PropertyOption[];
  /** Tasks per assignee key and per property id, with the other filters on. */
  ownerCounts: Record<string, number>;
  propertyCounts: Record<string, number>;
  meId: string;
  /** Per view while a search is typed, so a hit outside the current view shows. */
  viewCounts: Record<TaskView, number> | null;
  /** What the filters leave, and what they hide from the view. */
  shown: number;
  hidden: number;
  /** The list isn't in its opening state: the result line shows. */
  filtered: boolean;
};

const count = (map: ReadonlyMap<string, number>) => (row: OptionItem): OptionItem => ({ ...row, count: map.get(row.id) ?? 0 });

/**
 * The Tasks page's bar (selectors 3.7, 4.1 option 1): a search over the title,
 * the property and the assignee, Open | Done | All, and the Assignee and
 * Property filters with the Repeats toggle, as chips with a mouse on a wide
 * page and behind a Filters button elsewhere. State lives in the URL;
 * `children` is the list the server renders, which dims while a change loads.
 * Assignees list the team (you first), then contractors, then "Others" for
 * imported names that match nobody; each row counts the tasks picking it would
 * show.
 */
export function TaskFilters({ data, children }: { data: TaskFilterData; children: ReactNode }) {
  const { users, contractors, others, properties, meId, viewCounts } = data;
  const facets = useMemo<FilterFacet[]>(() => {
    const owners = new Map(Object.entries(data.ownerCounts));
    const places = new Map(Object.entries(data.propertyCounts));
    const people = assigneeRows({ users, contractors, meId, counts: owners });
    const buildings = propertyRows({ properties, counts: places });
    return [
      {
        kind: "multi",
        param: "owner",
        label: "Assignee",
        searchLabel: "Search people",
        emptyText: "No one matches.",
        pinned: people.pinned.map(count(owners)),
        sections: [
          ...people.sections,
          ...(others.length > 0
            ? [{ id: "others", title: "Others", items: others.map((n) => ({ id: `n:${n}`, label: n, count: owners.get(`n:${n}`) ?? 0 })) }]
            : []),
        ],
      },
      {
        kind: "multi",
        param: "property",
        label: "Property",
        searchLabel: "Search properties",
        emptyText: "No property matches.",
        pinned: buildings.pinned.map(count(places)),
        items: buildings.items,
      },
      { kind: "toggle", param: "repeats", label: "Repeats" },
    ];
  }, [data.ownerCounts, data.propertyCounts, users, contractors, others, properties, meId]);

  return (
    <FilterScope list="tasks" defaults={DEFAULTS}>
      <FilterBar
        noun={{ one: "task", many: "tasks" }}
        search={{ placeholder: "Search tasks" }}
        views={{
          param: "status",
          label: "Status",
          default: "open",
          options: VIEWS.map((v) => ({ ...v, count: viewCounts?.[v.key] })),
        }}
        facets={facets}
        wide="56rem"
        shown={data.shown}
        count={countTasksAction}
      />
      <FilterResults>
        {/* An empty list says so itself, with its own way out. */}
        {data.filtered && data.shown > 0 && <ResultLine shown={data.shown} hidden={data.hidden} noun={{ one: "task", many: "tasks" }} />}
        {children}
      </FilterResults>
    </FilterScope>
  );
}
