"use client";
import { useMemo, type ReactNode } from "react";
import { FilterBar, FilterResults, FilterScope, ResultLine, type FilterFacet } from "@/components/filter-bar";
import { countContractorsAction } from "./filter-actions";

export type ContractorFilterData = {
  /** Every trade, A to Z, with how many contractors do it under the other filters (a zero stays listed). */
  trades: { key: string; label: string; count: number }[];
  /** What the filters leave, and what they hide. */
  shown: number;
  hidden: number;
  /** Something narrows the list: the result line shows. */
  filtered: boolean;
};

const noun = { one: "contractor", many: "contractors" };

/**
 * The Contractors page's bar (selectors 5): a search over the name, the
 * company and the trades, a Trade filter with several picks, and two yes or
 * no chips, "Has login" and "Needs W-9" (no W-9 on file). With a mouse on a
 * wide page they are chips; elsewhere the search keeps the row beside one
 * Filters button. `children` is the table, which dims while a change loads.
 */
export function ContractorFilters({ data, children }: { data: ContractorFilterData; children: ReactNode }) {
  const facets = useMemo<FilterFacet[]>(
    () => [
      {
        kind: "multi",
        param: "trade",
        label: "Trade",
        searchLabel: "Search trades",
        emptyText: "No trade matches.",
        items: data.trades.map((t) => ({ id: t.key, label: t.label, count: t.count })),
      },
      { kind: "toggle", param: "login", label: "Has login" },
      { kind: "toggle", param: "w9", label: "Needs W-9" },
    ],
    [data.trades],
  );
  return (
    <FilterScope list="contractors">
      <FilterBar
        noun={noun}
        search={{ placeholder: "Search contractors" }}
        facets={facets}
        wide="56rem"
        shown={data.shown}
        count={countContractorsAction}
      />
      <FilterResults>
        {/* An empty list says so itself, with its own way out. */}
        {data.filtered && data.shown > 0 && <ResultLine shown={data.shown} hidden={data.hidden} noun={noun} />}
        {children}
      </FilterResults>
    </FilterScope>
  );
}
