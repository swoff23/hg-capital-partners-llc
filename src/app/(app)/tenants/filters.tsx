"use client";
import { useMemo, type ReactNode } from "react";
import { FilterBar, FilterResults, FilterScope, ResultLine, type FilterFacet } from "@/components/filter-bar";
import { countTenantsAction } from "./filter-actions";
import { DEFAULT_TENANT_SORT, DEFAULT_TENANT_VIEW, TENANT_SORT_CHOICES, TENANT_VIEWS, tenantSortPhrase } from "./query";

export type TenantFilterData = {
  /** Properties with a lease, in street order, with how many rows each has under the search. */
  properties: { key: string; label: string; count: number }[];
  /** What the filters leave, and what they hide. */
  shown: number;
  hidden: number;
  /** Something narrows the list: the result line shows. */
  filtered: boolean;
};

const noun = { one: "tenant", many: "tenants" };
const DEFAULTS = { view: DEFAULT_TENANT_VIEW, sort: DEFAULT_TENANT_SORT };

/**
 * The Tenants page's bar (docs/specs/tenants.md section 4): a search over the
 * name, phone, email, address and unit, the Current, Past and All views, a
 * Property facet with several picks, and the sort. With a mouse on a wide page
 * they are chips; elsewhere the search keeps the row beside one Filters
 * button. `children` is the table, which dims while a change loads.
 */
export function TenantFilters({ data, children }: { data: TenantFilterData; children: ReactNode }) {
  const facets = useMemo<FilterFacet[]>(
    () => [
      {
        kind: "multi",
        param: "property",
        label: "Property",
        searchLabel: "Search properties",
        emptyText: "No property matches.",
        items: data.properties.map((p) => ({ id: p.key, label: p.label, count: p.count })),
      },
    ],
    [data.properties],
  );
  return (
    <FilterScope list="tenants" defaults={DEFAULTS}>
      <FilterBar
        noun={noun}
        search={{ placeholder: "Search tenants" }}
        views={{ param: "view", label: "Tenant view", default: DEFAULT_TENANT_VIEW, options: TENANT_VIEWS }}
        facets={facets}
        sort={{ param: "sort", default: DEFAULT_TENANT_SORT, choices: TENANT_SORT_CHOICES, phrase: tenantSortPhrase }}
        wide="56rem"
        shown={data.shown}
        count={countTenantsAction}
      />
      <FilterResults>
        {/* An empty list says so itself, with its own way out. */}
        {data.filtered && data.shown > 0 && <ResultLine shown={data.shown} hidden={data.hidden} noun={noun} />}
        {children}
      </FilterResults>
    </FilterScope>
  );
}

/** The bar as the loading screen draws it (tenants/(list)/loading.tsx): inert, no counts. */
export function TenantFiltersPlaceholder() {
  return (
    <FilterBar
      placeholder
      search={{ placeholder: "Search tenants" }}
      views={{ param: "view", label: "Tenant view", default: DEFAULT_TENANT_VIEW, options: TENANT_VIEWS }}
      facets={[{ kind: "multi", param: "property", label: "Property" }]}
      sort={{ param: "sort", default: DEFAULT_TENANT_SORT }}
      wide="56rem"
    />
  );
}
