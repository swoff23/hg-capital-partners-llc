import type { Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { compareStreet } from "@/lib/normalize";
import type { ListAssignee, ListTask } from "./list";

/**
 * The Tasks list's sort (docs/specs/task-list-sort.md): by property (the
 * default, a heading per building), by due date (one flat list), or by
 * assignee (a heading per person). Inside a building or a person, and in the
 * Due sort, overdue and soonest due come first and undated tasks last; Done
 * puts the newest finished first instead. Pure and safe in the browser: the
 * server sorts the rows with it (queries.ts allTasks) and the list groups
 * them with the same keys (all-list.tsx).
 *
 * The URL's `sort`: none (Property A to Z), `-property`, `due`, `-due`,
 * `assignee`, `-assignee`.
 */

export type TaskSortField = "property" | "due" | "assignee";

export interface TaskSort {
  field: TaskSortField;
  desc: boolean;
}

/** The sort the list opens in; it stays out of the URL. */
export const DEFAULT_TASK_SORT = "property";

const FIELDS: readonly TaskSortField[] = ["property", "due", "assignee"];

/** The URL's `sort`. Anything the list doesn't sort by is the default. */
export function parseTaskSort(raw: string | null | undefined): TaskSort {
  const value = (raw ?? "").trim();
  const desc = value.startsWith("-");
  const field = (desc ? value.slice(1) : value) as TaskSortField;
  return FIELDS.includes(field) ? { field, desc } : { field: "property", desc: false };
}

/** The sorts the Filters sheet offers, the default first. */
export const TASK_SORT_CHOICES: readonly { value: string; label: string }[] = [
  { value: DEFAULT_TASK_SORT, label: "Property A to Z" },
  { value: "due", label: "Due date, overdue first" },
  { value: "assignee", label: "Assignee A to Z" },
];

const WORDS: Record<TaskSortField, { asc: string; desc: string }> = {
  property: { asc: "Property A to Z", desc: "Property Z to A" },
  due: { asc: "Due date, overdue first", desc: "Due date, latest first" },
  assignee: { asc: "Assignee A to Z", desc: "Assignee Z to A" },
};

/** What a `sort` value reads as, or null for one the list doesn't sort by. */
export function taskSortPhrase(value: string): string | null {
  const desc = value.startsWith("-");
  const words = WORDS[(desc ? value.slice(1) : value) as TaskSortField];
  return words ? (desc ? words.desc : words.asc) : null;
}

/* ---------------- Groups ---------------- */

/** The group of rows with no property, or no one assigned. Always last. */
export const NO_GROUP = "none";

/** Which building a row files under: its property, or its deal's address when there's no property. */
export function placeKey(t: Pick<ListTask, "propertyId" | "place">): string {
  if (t.propertyId) return `p:${t.propertyId}`;
  return t.place ? `d:${t.place}` : NO_GROUP;
}

/** Whose a row is: the person (an imported name merged into the person it stands for), the bare imported name, or nobody. */
export function personKey(a: ListAssignee | null): string {
  if (!a) return NO_GROUP;
  if (a.kind === "user") return `u:${a.id}`;
  if (a.kind === "contact") return `c:${a.id}`;
  return a.person?.key ?? `n:${a.name}`;
}

/** The name a row's person reads as: the merged person's name for an imported one. */
export function personName(a: ListAssignee | null): string | null {
  if (!a) return null;
  if (a.kind === "user") return a.name ?? a.email;
  if (a.kind === "name") return a.person?.name ?? a.name;
  return a.name;
}

/**
 * The name beside a row's avatar: the first name, or an email's local part
 * ("zack" from zack@outlawcarpentry.com) for an imported address.
 */
export function shortName(name: string | null): string | null {
  if (!name) return null;
  const s = name.trim();
  if (s.includes("@")) return s.split("@")[0].split(/[._+-]/)[0] || s;
  return firstName(s) || s;
}

/** The heading a row files under for this sort, or null for the flat Due list. */
export function groupKeyOf(t: Pick<ListTask, "propertyId" | "place" | "assignee">, field: TaskSortField): string | null {
  if (field === "property") return placeKey(t);
  if (field === "assignee") return personKey(t.assignee);
  return null;
}

/* ---------------- Ordering ---------------- */

/** What the server sorts every matching row by, before it loads a page of them. */
export interface SortRow {
  id: string;
  due: Ymd | null;
  /** ISO instants. */
  finished: string | null;
  created: string;
  place: string | null;
  placeKey: string;
  person: string | null;
  personKey: string;
}

const names = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Nulls last whichever way the rest goes. */
function nullsLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compare(a, b);
}

const asc = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
const descending = (x: string, y: string) => asc(y, x);

/** The order inside a group: overdue and soonest first, undated last; Done newest finished first. Then newest created. */
function within(view: "open" | "done" | "all") {
  return (a: SortRow, b: SortRow) =>
    (view === "done" ? nullsLast(a.finished, b.finished, descending) : nullsLast(a.due, b.due, asc)) ||
    descending(a.created, b.created) ||
    asc(a.id, b.id);
}

/**
 * The rows in the list's order. Every row of a group sits together, so the
 * list can head each run once; "No property" and "Unassigned" stay last when
 * the order flips, and so do undated rows in the Due sort.
 */
export function sortRows(rows: readonly SortRow[], sort: TaskSort, view: "open" | "done" | "all"): SortRow[] {
  const inner = within(view);
  const flip = sort.desc ? -1 : 1;
  let compare: (a: SortRow, b: SortRow) => number;
  if (sort.field === "due") {
    compare = (a, b) =>
      nullsLast(a.due, b.due, (x, y) => flip * asc(x, y)) ||
      (view === "done" ? nullsLast(a.finished, b.finished, descending) : 0) ||
      descending(a.created, b.created) ||
      asc(a.id, b.id);
  } else {
    const key = sort.field === "property" ? (r: SortRow) => r.placeKey : (r: SortRow) => r.personKey;
    const order =
      sort.field === "property"
        ? (a: SortRow, b: SortRow) => compareStreet(a.place, b.place)
        : (a: SortRow, b: SortRow) => names.compare(a.person ?? "", b.person ?? "");
    compare = (a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka !== kb) {
        if (ka === NO_GROUP || kb === NO_GROUP) return ka === NO_GROUP ? 1 : -1;
        return flip * (order(a, b) || asc(ka, kb));
      }
      return inner(a, b);
    };
  }
  return [...rows].sort(compare);
}

/** How many rows each group holds, across every page, so a heading cut by Show more still counts its whole group. */
export function groupCounts(rows: readonly SortRow[], field: TaskSortField): Record<string, number> {
  const counts: Record<string, number> = {};
  if (field === "due") return counts;
  for (const r of rows) {
    const k = field === "property" ? r.placeKey : r.personKey;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
