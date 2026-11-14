import type { TenantRow, TenantView } from "@/lib/tenants/queries";
import { joinFacet, parseFacet } from "@/lib/list-memory";

/*
 * What the Tenants page asks of its URL (docs/specs/tenants.md section 4):
 * `view` (current, past, all; current is the default and stays out of the
 * URL), `q`, `property` (property ids, comma-joined) and `sort` (a column,
 * "-" for descending). Pure; tenantRows (lib/tenants/queries.ts) reads the
 * view and the search, and the rest is applied on its rows.
 */

export const TENANT_VIEWS: readonly { key: TenantView; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];
export const DEFAULT_TENANT_VIEW: TenantView = "current";
/** Street order, then the unit's place in the property: the order tenantRows returns. */
export const DEFAULT_TENANT_SORT = "home";

export interface TenantFilters {
  q: string;
  view: TenantView;
  /** Property ids. */
  properties: string[];
  sort: string;
}

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const WORDS: Record<string, { asc: string; desc: string }> = {
  home: { asc: "Home, street order", desc: "Home, last to first" },
  name: { asc: "Name A to Z", desc: "Name Z to A" },
  rent: { asc: "Rent, low to high", desc: "Rent, high to low" },
  ends: { asc: "Lease ends, soonest", desc: "Lease ends, latest" },
};

export function parseTenantFilters(sp: Params): TenantFilters {
  const view = TENANT_VIEWS.find((v) => v.key === str(sp.view))?.key ?? DEFAULT_TENANT_VIEW;
  const raw = str(sp.sort);
  const sort = WORDS[raw.startsWith("-") ? raw.slice(1) : raw] ? raw : DEFAULT_TENANT_SORT;
  return { q: str(sp.q).trim(), view, properties: parseFacet(str(sp.property)), sort };
}

/** The query as a URL query string. */
export function tenantQuery(f: TenantFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.view !== DEFAULT_TENANT_VIEW) p.set("view", f.view);
  if (f.properties.length) p.set("property", joinFacet(f.properties));
  if (f.sort !== DEFAULT_TENANT_SORT) p.set("sort", f.sort);
  return p.toString();
}

/** Whether a search or the Property facet narrows the list: the result line shows. A view is a different list, not a narrowing. */
export const isNarrowed = (f: TenantFilters) => f.q !== "" || f.properties.length > 0;

/** The sorts the phone's Filters sheet offers, the default first. */
export const TENANT_SORT_CHOICES: readonly { value: string; label: string }[] = [
  { value: DEFAULT_TENANT_SORT, label: WORDS.home.asc },
  { value: "name", label: WORDS.name.asc },
  { value: "-rent", label: WORDS.rent.desc },
  { value: "ends", label: WORDS.ends.asc },
];

/** What a `sort` value reads as, or null for a column the list doesn't sort by. */
export function tenantSortPhrase(sort: string): string | null {
  const desc = sort.startsWith("-");
  const words = WORDS[desc ? sort.slice(1) : sort];
  return words ? (desc ? words.desc : words.asc) : null;
}

/** Rows that sit in one of the picked properties; no picks keeps everyone. */
export const inProperties = <T extends { propertyId: string }>(rows: readonly T[], picks: readonly string[]): T[] =>
  picks.length === 0 ? [...rows] : rows.filter((r) => picks.includes(r.propertyId));

/** How many rows each property has, for the facet's counts. */
export function propertyCounts(rows: readonly { propertyId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.propertyId, (counts.get(r.propertyId) ?? 0) + 1);
  return counts;
}

/**
 * Sorted by a column. The rows arrive in Home order and the sort is stable,
 * so equal rows keep it. Rent and Lease ends put a row with none last either way.
 */
export function sortTenants<T extends Pick<TenantRow, "fullName" | "rent" | "endsOn">>(rows: readonly T[], sort: string): T[] {
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  const out = [...rows];
  if (field === "home") return desc ? out.reverse() : out;
  const sign = desc ? -1 : 1;
  if (field === "name") return out.sort((a, b) => sign * a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base" }));
  const key = (r: T): number | string | null => (field === "rent" ? r.rent : r.endsOn === "" ? null : r.endsOn);
  return out.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x < y ? -1 : x > y ? 1 : 0);
  });
}

/** The header's count: the whole list in this view. */
export function tenantsCount(total: number, view: TenantView): string {
  const n = total.toLocaleString("en-US");
  const noun = total === 1 ? "tenant" : "tenants";
  return view === "current" ? `${n} current ${noun}` : view === "past" ? `${n} past ${noun}` : `${n} ${noun}`;
}

/** The one sentence an empty list says, and the way out. `total` is the view's whole. */
export function emptyTenants(f: TenantFilters, total: number): { line: string; clear: "search" | "filters" | null } {
  if (total === 0) {
    return { line: f.view === "current" ? "No current tenants yet." : f.view === "past" ? "No past tenants yet." : "No tenants yet.", clear: null };
  }
  if (f.q && f.properties.length === 0) return { line: `No tenants match “${f.q}”.`, clear: "search" };
  return { line: "No tenants match these filters.", clear: "filters" };
}
