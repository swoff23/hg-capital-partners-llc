import { Prisma } from "@prisma/client";
import { joinFacet, parseFacet } from "@/lib/list-memory";
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
 * The filters in the URL. A `status` that isn't one of the three is Open.
 * Old links carry `?assignee=me` and `?owner=n:<name>`; the page turns those
 * into the person's key before it gets here (`withoutAssigneeShortcut`,
 * `withMergedOwners`), so the bar always shows the pick and can clear it.
 */
export function parseAllFilters(sp: Params): AllFilters {
  const status = str(sp.status);
  return {
    status: (TASK_VIEWS as readonly string[]).includes(status) ? (status as TaskView) : "open",
    owner: parseFacet(str(sp.owner)),
    property: parseFacet(str(sp.property)),
    repeats: str(sp.repeats) === "1",
    q: str(sp.q).trim(),
  };
}

/** Every value of every param, a repeated one kept, as a query to put back in a link. */
export function toQuery(sp: Params): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v);
  }
  return qs;
}

/**
 * The query for an old `?assignee=me` link ("assigned to me"), with every
 * other param kept: `owner=u:<meId>` in its place, or just dropped when the
 * link already has an `owner` (which supersedes it). Null when the link has no
 * `assignee=me`, so there's nothing to redirect.
 */
export function withoutAssigneeShortcut(sp: Params, meId: string): string | null {
  const asked = Array.isArray(sp.assignee) ? sp.assignee : [sp.assignee];
  if (!asked.includes("me")) return null;
  const qs = toQuery(sp);
  qs.delete("assignee");
  if (parseFacet(str(sp.owner)).length === 0) qs.set("owner", `u:${meId}`);
  return qs.toString();
}

/** Legacy free-text names that stand for a person (mergeLegacyNames): the person's key to the names. */
export type LegacyNames = ReadonlyMap<string, readonly string[]>;

/** The other way round: each legacy name to the key of the person it stands for. */
export function personOfLegacyName(legacy: LegacyNames): Map<string, string> {
  const people = new Map<string, string>();
  for (const [key, names] of legacy) for (const n of names) people.set(n, key);
  return people;
}

/**
 * The query for an old link that picks a legacy name which now stands for a
 * person (`owner=n:Brandon Zarbo` once Brandon is a contractor): that pick
 * becomes the person's key, once, and every other param stays. Without it the
 * bar would show the raw key and couldn't untick it, since the name no longer
 * has a row of its own. Null when no pick is a merged name.
 */
export function withMergedOwners(sp: Params, legacy: LegacyNames): string | null {
  const people = new Map<string, string>();
  for (const [name, key] of personOfLegacyName(legacy)) {
    // The key was made from the trimmed name, and the stored one may carry spaces.
    people.set(name, key);
    if (!people.has(name.trim())) people.set(name.trim(), key);
  }
  let changed = false;
  const owner = parseFacet(str(sp.owner)).map((pick) => {
    const person = pick.startsWith("n:") ? people.get(pick.slice(2)) : undefined;
    if (person) changed = true;
    return person ?? pick;
  });
  if (!changed) return null;
  const qs = toQuery(sp);
  qs.set("owner", joinFacet([...new Set(owner)]));
  return qs.toString();
}

/**
 * The query for a link that names what the page doesn't have (a status that
 * isn't Open, Done or All; a person or property that's gone or never was):
 * those go, every other param stays, so the bar shows Open picked and never a
 * raw id in a chip. `known` holds the picks the filters list (people by their
 * keys, properties by id); "none" always counts. Null when every value is known.
 */
export function withKnownFilters(sp: Params, known: { owner: ReadonlySet<string>; property: ReadonlySet<string> }): string | null {
  const qs = toQuery(sp);
  let changed = false;
  if (qs.has("status") && !(TASK_VIEWS as readonly string[]).includes(str(sp.status))) {
    qs.delete("status");
    changed = true;
  }
  for (const param of ["owner", "property"] as const) {
    if (!qs.has(param)) continue;
    const picks = parseFacet(str(sp[param]));
    const kept = picks.filter((k) => k === NONE || known[param].has(k));
    if (kept.length === picks.length && picks.length > 0) continue;
    changed = true;
    if (kept.length > 0) qs.set(param, joinFacet(kept));
    else qs.delete(param);
  }
  return changed ? qs.toString() : null;
}

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
 * The palette's task search: the Tasks page's words over the same fields, on
 * the same rows. Template rows are playbooks, not work, so neither one finds
 * them.
 */
export function paletteTaskWhere(q: string): Prisma.TaskWhereInput {
  return { AND: [excludeTemplateTasks, searchWhere(q)] };
}

/**
 * Any of the picked people. A picked person also finds the imported rows
 * that carry their name in `legacy` (TASKS-013), and those rows are theirs
 * alone: Unassigned is no real person and no name that stands for one, the
 * legacy names that are nobody included, as Today's Unassigned is (list.ts
 * groupMine), so the row Asana gave Kenneth reads as Kenneth's on both.
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
  if (nobody) {
    // NOT IN is never true of a null name, so no name at all is its own branch.
    const someone = [...new Set([...legacy.values()].flat())];
    any.push(
      someone.length > 0
        ? { assigneeUserId: null, assigneeContactId: null, OR: [{ assigneeName: null }, { assigneeName: { notIn: someone } }] }
        : { assigneeUserId: null, assigneeContactId: null },
    );
  }
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
 * for a person counts for that person alone, and a task with nobody behind
 * it counts under Unassigned, as the filter treats them (ownerWhere).
 */
export function ownerCounts(rows: readonly OwnerCountRow[], legacy: LegacyNames = new Map()): Map<string, number> {
  const personOfName = personOfLegacyName(legacy);
  const counts = new Map<string, number>();
  const add = (key: string, n: number) => counts.set(key, (counts.get(key) ?? 0) + n);
  for (const r of rows) {
    if (r.assigneeUserId) add(`u:${r.assigneeUserId}`, r.count);
    else if (r.assigneeContactId) add(`c:${r.assigneeContactId}`, r.count);
    else {
      const person = r.assigneeName ? personOfName.get(r.assigneeName) : undefined;
      if (person) {
        add(person, r.count);
        continue;
      }
      add(NONE, r.count);
      if (r.assigneeName) add(`n:${r.assigneeName}`, r.count);
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
