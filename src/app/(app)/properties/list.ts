import { PROPERTY_STATUSES } from "@/lib/config";
import { compareStreet } from "@/lib/normalize";
import { parseFacet } from "@/lib/list-memory";

/*
 * The Portfolio list's filter and sort (docs/specs/selectors.md 3.6, 4.1 and
 * 5): a Status chip with several picks, and sort by Property (street, then
 * house number), Value or Units. Pure, so list.test.ts checks it without a
 * database. The URL: `status` (comma-joined, "none" for a property with no
 * status) and `sort` (a column, "-" for descending; Address is the default).
 */

/** The pick that stands for a property with no status. */
export const NO_STATUS = "none";

export const DEFAULT_PROPERTY_SORT = "address";

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parsePropertyFilters(sp: Params): { statuses: string[]; sort: string } {
  return { statuses: parseFacet(str(sp.status)), sort: str(sp.sort) || DEFAULT_PROPERTY_SORT };
}

/** A row's pick key: its status, or "none". */
export const statusKey = (status: string | null | undefined) => status?.trim() || NO_STATUS;

/**
 * The statuses that exist, in lifecycle order (Rehabbing to Sold), then any
 * typed before the list existed, A to Z, and "none" last when a property has
 * none. Each with how many properties carry it.
 */
export function statusOptions(statuses: readonly (string | null | undefined)[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(statusKey(s), (counts.get(statusKey(s)) ?? 0) + 1);
  const known = (PROPERTY_STATUSES as readonly string[]).filter((s) => counts.has(s));
  const other = [...counts.keys()].filter((k) => k !== NO_STATUS && !known.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...known, ...other, ...(counts.has(NO_STATUS) ? [NO_STATUS] : [])].map((key) => ({
    key,
    label: key === NO_STATUS ? "No status" : key,
    count: counts.get(key) ?? 0,
  }));
}

/** The rows whose status is picked; no picks keeps them all. */
export function filterByStatus<T extends { status: string | null }>(rows: readonly T[], picks: readonly string[]): T[] {
  return picks.length === 0 ? [...rows] : rows.filter((r) => picks.includes(statusKey(r.status)));
}

export type PropertySortRow = { address: string; value: unknown; units: number | null };

const toNumber = (v: unknown): number | null => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Sorted by a column: Property by street then house number (15 before 118),
 * Value and Units by the figure. A row with none goes last either way, and
 * equal rows keep street order.
 */
export function sortProperties<T extends PropertySortRow>(rows: readonly T[], sort: string): T[] {
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  const byStreet = (a: T, b: T) => compareStreet(a.address, b.address);
  const figure = field === "value" ? (r: T) => toNumber(r.value) : field === "units" ? (r: T) => r.units : null;
  if (!figure) return [...rows].sort((a, b) => (desc ? -byStreet(a, b) : byStreet(a, b)));
  return [...rows].sort((a, b) => {
    const x = figure(a);
    const y = figure(b);
    if (x === null || y === null) return x === y ? byStreet(a, b) : x === null ? 1 : -1;
    return (desc ? y - x : x - y) || byStreet(a, b);
  });
}

/** The sorts the phone's Filters sheet offers, the default first. */
export const PROPERTY_SORT_CHOICES: readonly { value: string; label: string }[] = [
  { value: DEFAULT_PROPERTY_SORT, label: "Address A to Z" },
  { value: "-value", label: "Value, high to low" },
  { value: "value", label: "Value, low to high" },
  { value: "-units", label: "Most units" },
];

const WORDS: Record<string, { asc: string; desc: string }> = {
  address: { asc: "Address A to Z", desc: "Address Z to A" },
  value: { asc: "Value, low to high", desc: "Value, high to low" },
  units: { asc: "Fewest units", desc: "Most units" },
};

/** What a `sort` value reads as, or null for a column the list doesn't sort by. */
export function propertySortPhrase(sort: string): string | null {
  const desc = sort.startsWith("-");
  const words = WORDS[desc ? sort.slice(1) : sort];
  return words ? (desc ? words.desc : words.asc) : null;
}

/** Whether the list is anything but its opening state. */
export const isPropertyListFiltered = (f: { statuses: readonly string[]; sort: string }) =>
  f.statuses.length > 0 || f.sort !== DEFAULT_PROPERTY_SORT;
