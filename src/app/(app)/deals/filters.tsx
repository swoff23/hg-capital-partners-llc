"use client";
import { useMemo, type ReactNode } from "react";
import { DealStageMark } from "@/components/deal-stage";
import { FilterBar, FilterResults, FilterScope, ResultLine, type FilterFacet } from "@/components/filter-bar";
import { dealStageLabel } from "@/lib/config";
import { countDealsAction } from "./filter-actions";
import { DEAL_SORT_CHOICES, DEFAULT_DEAL_SORT, dealSortPhrase } from "./format";
import { DEAL_VIEWS, DEFAULT_DEAL_VIEW, hasStageChip, viewStages, type DealView } from "./query";

/** Active is the opening view, so it stays out of the URL, and so does the default sort. */
const DEFAULTS = { status: DEFAULT_DEAL_VIEW, sort: DEFAULT_DEAL_SORT } as const;

export type DealFilterData = {
  view: DealView;
  /** Deals per view, with the search applied. */
  counts: Record<DealView, number>;
  /** Deals per stage, with the search applied. */
  stageCounts: Record<string, number>;
  /** What the filters leave, and what they hide from the view. */
  shown: number;
  hidden: number;
  /** The list isn't in its opening state: the result line shows. */
  filtered: boolean;
};

/**
 * The Deals page's bar (selectors 4.3 A): a search over the address, six
 * views with their counts (Active first, never none), and a Stage chip that
 * narrows inside Active and All. A wide page (60rem) shows the six as
 * segments and the chip; anywhere else the views are a menu naming the
 * current one, and the Filters sheet holds Stage and Sort. `children` is the
 * table the server renders, which dims while a change loads.
 */
export function DealFilters({ data, children }: { data: DealFilterData; children: ReactNode }) {
  const { view } = data;
  const facets = useMemo<FilterFacet[]>(
    () =>
      hasStageChip(view)
        ? [
            {
              kind: "multi",
              param: "statuses",
              label: "Stage",
              searchLabel: "Search stages",
              emptyText: "No stage matches.",
              items: viewStages(view).map((stage) => ({
                id: stage,
                label: dealStageLabel(stage),
                leading: <DealStageMark stage={stage} />,
                count: data.stageCounts[stage] ?? 0,
              })),
            },
          ]
        : [],
    [view, data.stageCounts],
  );

  return (
    <FilterScope list="deals" defaults={DEFAULTS}>
      <FilterBar
        noun={{ one: "deal", many: "deals" }}
        search={{ placeholder: "Search deals" }}
        views={{
          param: "status",
          label: "Deal view",
          default: DEFAULT_DEAL_VIEW,
          options: DEAL_VIEWS.map((v) => ({ key: v.key, label: v.label, count: data.counts[v.key] })),
          menu: { sheetTitle: "Show" },
          // A new view starts the Stage chip over: it narrows inside the view you picked.
          resets: ["statuses"],
        }}
        facets={facets}
        sort={{ param: "sort", default: DEFAULT_DEAL_SORT, choices: DEAL_SORT_CHOICES, phrase: dealSortPhrase }}
        wide="60rem"
        shown={data.shown}
        count={countDealsAction}
      />
      <FilterResults>
        {/* An empty list says so itself, with its own way out. */}
        {data.filtered && data.shown > 0 && <ResultLine shown={data.shown} hidden={data.hidden} noun={{ one: "deal", many: "deals" }} />}
        {children}
      </FilterResults>
    </FilterScope>
  );
}
