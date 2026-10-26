"use client";
import { useMemo, type ReactNode } from "react";
import { FilterBar, FilterResults, FilterScope, ResultLine, type FilterFacet } from "@/components/filter-bar";
import { parseFacet } from "@/lib/list-memory";
import { DEFAULT_PROPERTY_SORT, NO_STATUS, PROPERTY_SORT_CHOICES, propertySortPhrase, statusKey } from "./list";

export type PropertyFilterData = {
  /** Each property's status as stored (null for none): the sheet's "Show 4 properties" counts these. */
  statuses: (string | null)[];
  options: { key: string; label: string; count: number }[];
  /** What the filters leave, and what they hide. */
  shown: number;
  hidden: number;
  /** The list isn't in its opening state: the result line shows. */
  filtered: boolean;
};

const noun = { one: "property", many: "properties" };

/**
 * The Portfolio's bar (selectors 4.1 option 1, migration map): one Status
 * chip with several picks and the number of properties behind each, and no
 * search for 11 rows. Below a wide page it is a Filters button whose sheet
 * holds Status and Sort, since the table's sortable headers go with the
 * columns on a phone. `children` is the table, which dims while a change loads.
 */
export function PropertyFilters({ data, children }: { data: PropertyFilterData; children: ReactNode }) {
  const facets = useMemo<FilterFacet[]>(
    () => [
      {
        kind: "multi",
        param: "status",
        label: "Status",
        searchLabel: "Search statuses",
        emptyText: "No status matches.",
        items: data.options.map((o) => ({ id: o.key, label: o.label, count: o.count, muted: o.key === NO_STATUS })),
      },
    ],
    [data.options],
  );

  // The list is whole in the browser, so the sheet counts its own picks.
  const count = async (query: string) => {
    const picks = parseFacet(new URLSearchParams(query).get("status"));
    return picks.length === 0 ? data.statuses.length : data.statuses.filter((s) => picks.includes(statusKey(s))).length;
  };

  return (
    <FilterScope list="properties">
      <FilterBar
        noun={noun}
        facets={facets}
        sort={{ param: "sort", default: DEFAULT_PROPERTY_SORT, choices: PROPERTY_SORT_CHOICES, phrase: propertySortPhrase }}
        wide="56rem"
        shown={data.shown}
        count={count}
        className="mt-6"
      />
      <FilterResults>
        {/* An empty list says so itself, with its own way out. */}
        {data.filtered && data.shown > 0 && <ResultLine shown={data.shown} hidden={data.hidden} noun={noun} />}
        {children}
      </FilterResults>
    </FilterScope>
  );
}
