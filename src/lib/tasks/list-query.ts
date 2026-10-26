import { Prisma } from "@prisma/client";
import { parseFacet } from "@/lib/list-memory";
import { everyTermMatches, searchTerms } from "@/lib/search";
import { activeTask, closedTask, excludeTemplateTasks } from "@/lib/task-scope";
import type { PersonRef } from "./assignee-people";

/**
 * What the Tasks page asks of the database (docs/specs/selectors.md 3.7 and
 * 5, search 2.11): the filters read from the URL, and the `where` and order
 * they make. Pure, so list.test.ts checks it without a database; the queries
 * that run it are in ./queries. It imports Prisma's runtime for its null
 * filters, so only server code takes it (the browser takes ./list).
 *
 * The URL: `status` (open, done or all; open is the default and stays out of
 * it), `owner` and `property` (comma-joined picks), `repeats=1` and `q`.
 */

export type TaskView = "open" | "done" | "all";

export const TASK_VIEWS: readonly TaskView[] = ["open", "done", "all"];

/** The pick that stands for "nobody" in owner, and for "no property" in property. */
export const NONE = "none";

export interface AllFilters {
  status: TaskView;
  /** "u:<userId>", "c:<contactId>", "n:<legacy name>" or "none"; several picks join. */
  owner: string[];
  /** Property ids, and "none" for a task with no property. */
  property: string[];
  /** Only tasks that repeat. */
  repeats: boolean;
  q: string;
}

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * The filters in the URL. `?assignee=me` is the old "assigned to me"
 * shortcut and `?owner=` supersedes it. A `status` that isn't one of the three
 * is Open.
 */
export function parseAllFilters(sp: Params, meId: string): AllFilters {
  const status = str(sp.status);
  const owner = parseFacet(str(sp.owner));
  return {
    status: (TASK_VIEWS as readonly string[]).includes(status) ? (status as TaskView) : "open",
    owner: owner.length > 0 ? owner : sp.assignee === "me" ? [`u:${meId}`] : [],
    property: parseFacet(str(sp.property)),
    repeats: str(sp.repeats) === "1",
    q: str(sp.q).trim(),
  };
}

/** Legacy free-text names that stand for a person (mergeLegacyNames): the person's key to the names. */
export type LegacyNames = ReadonlyMap<string, readonly string[]>;

/** Which of the facets a count leaves out, so a facet's rows count what picking each would show. */
export type OmitFacet = "owner" | "property";

/** Open, Done (Done and Canceled) or All. */
export function viewWhere(status: TaskView): Prisma.TaskWhereInput {
  return status === "done" ? closedTask : status === "all" ? {} : activeTask;
}

/**
 * Every word must match one of: the title, the property's or the deal's
 * address, or who it's assigned to (a teammate, a contractor or a legacy
 * name). The fields `/api/search` matches tasks on, so the same words find
 * the same tasks here and in the palette.
 */
export function searchWhere(q: string): Prisma.TaskWhereInput {
  const terms = searchTerms(q);
  if (terms.length === 0) return {};
  return everyTermMatches<Prisma.TaskWhereInput>(terms, (t) => [
    { title: t },
    { property: { address: t } },
    { deal: { address: t } },
    { assignee: { name: t } },
    { assigneeContact: { fullName: t } },
    { assigneeName: t },
  ]);
}

/**
 * Any of the picked people. Unassigned is "no real person", legacy free-text
 * names included, as Today's Unassigned is. A picked person also finds the
 * imported rows that carry their name in `legacy` (TASKS-013).
 */
export function ownerWhere(owner: readonly string[], legacy: LegacyNames = new Map()): Prisma.TaskWhereInput {
  const users: string[] = [];
  const contacts: string[] = [];
  const names: string[] = [];
  let nobody = false;
  for (const key of owner) {
    if (key.startsWith("u:")) users.push(key.slice(2));
    else if (key.startsWith("c:")) contacts.push(key.slice(2));
    else if (key.startsWith("n:")) names.push(key.slice(2));
    else if (key === NONE) nobody = true;
    if (key.startsWith("u:") || key.startsWith("c:")) names.push(...(legacy.get(key) ?? []));
  }
  const any: Prisma.TaskWhereInput[] = [];
  if (users.length > 0) any.push({ assigneeUserId: { in: users } });
  if (contacts.length > 0) any.push({ assigneeContactId: { in: contacts } });
  if (names.length > 0) any.push({ assigneeName: { in: [...new Set(names)] }, assigneeUserId: null, assigneeContactId: null });
  if (nobody) any.push({ assigneeUserId: null, assigneeContactId: null });
  return any.length > 0 ? { OR: any } : {};
}

/** Any of the picked properties, and "none" for the tasks with no property. */
export function propertyWhere(property: readonly string[]): Prisma.TaskWhereInput {
  const ids = property.filter((p) => p !== NONE);
  const any: Prisma.TaskWhereInput[] = [];
  if (ids.length > 0) any.push({ propertyId: { in: ids } });
  if (property.includes(NONE)) any.push({ propertyId: null });
  return any.length > 0 ? { OR: any } : {};
}

/** Only tasks with a repeat rule. */
export const repeatsWhere = { repeatRule: { not: Prisma.DbNull } } satisfies Prisma.TaskWhereInput;

/**
 * The Tasks page's `where`: no Template rows, the view, the picks, the
 * search. Each part is its own entry in one AND, since owner and property
 * both need an OR of their own. `omit` leaves one facet out, for the counts
 * beside its rows.
 */
export function allTasksWhere(f: AllFilters, legacy: LegacyNames = new Map(), omit?: OmitFacet): Prisma.TaskWhereInput {
  const parts: Prisma.TaskWhereInput[] = [
    excludeTemplateTasks,
    viewWhere(f.status),
    omit === "owner" ? {} : ownerWhere(f.owner, legacy),
    omit === "property" ? {} : propertyWhere(f.property),
    f.repeats ? repeatsWhere : {},
    searchWhere(f.q),
  ];
  return { AND: parts.filter((p) => Object.keys(p).length > 0) };
}

/** Every task in the view, whatever the picks and the search: what "hidden by filters" is measured against. */
export function viewScopeWhere(status: TaskView): Prisma.TaskWhereInput {
  return { AND: [excludeTemplateTasks, viewWhere(status)].filter((p) => Object.keys(p).length > 0) };
}

/**
 * Open and All: soonest due first, undated last, newest made first among
 * equals. Done: the newest finished first (BTASKS-010), so recent work is on
 * top; a row with no finish time sorts last.
 */
export function allTasksOrderBy(status: TaskView): Prisma.TaskOrderByWithRelationInput[] {
  if (status === "done") return [{ completedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  return [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
}

/* ---------------- Counts beside the filter rows ---------------- */

/** A row of the assignee count query: how many tasks carry this combination. */
export interface OwnerCountRow {
  assigneeUserId: string | null;
  assigneeContactId: string | null;
  assigneeName: string | null;
  count: number;
}

/**
 * Tasks per assignee key, from the grouped rows. A legacy name that stands
 * for a person counts for that person too, and a task with no real person
 * counts under Unassigned, as the filter treats them.
 */
export function ownerCounts(rows: readonly OwnerCountRow[], legacy: LegacyNames = new Map()): Map<string, number> {
  const personOfName = new Map<string, string>();
  for (const [key, names] of legacy) for (const n of names) personOfName.set(n, key);
  const counts = new Map<string, number>();
  const add = (key: string, n: number) => counts.set(key, (counts.get(key) ?? 0) + n);
  for (const r of rows) {
    if (r.assigneeUserId) add(`u:${r.assigneeUserId}`, r.count);
    else if (r.assigneeContactId) add(`c:${r.assigneeContactId}`, r.count);
    else {
      add(NONE, r.count);
      if (r.assigneeName) {
        const person = personOfName.get(r.assigneeName);
        add(person ?? `n:${r.assigneeName}`, r.count);
      }
    }
  }
  return counts;
}

/** Tasks per property id, with "none" for no property. */
export function propertyCounts(rows: readonly { propertyId: string | null; count: number }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.propertyId ?? NONE, (counts.get(r.propertyId ?? NONE) ?? 0) + r.count);
  return counts;
}

/** The people legacy names are matched against: the team and the contractors the filter lists, by their picker keys. */
export function personRefs(
  users: readonly { id: string; name: string | null; email: string }[],
  contractors: readonly { id: string; name: string; email?: string | null }[],
): PersonRef[] {
  return [
    ...users.map((u) => ({ key: `u:${u.id}`, name: u.name ?? u.email, email: u.email })),
    ...contractors.map((c) => ({ key: `c:${c.id}`, name: c.name, email: c.email })),
  ];
}
