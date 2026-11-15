import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { easternDayStart, toYmd, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { DAILY_EMAIL_CAP } from "@/lib/notifications/content";
import { sentSince } from "@/lib/notifications/sent-count";
import { mergeLegacyNames, type PersonRef } from "./assignee-people";
import { assigneeOptions } from "./assignee-options";
import { toListTask, withLegacyPeople, type ListAssignee, type ListTask } from "./list";
import { groupCounts, personKey, personName, placeKey, sortRows, type SortRow, type TaskSort } from "./list-sort";
import { unreadTaskIds } from "./read-state";
import {
  NONE,
  allTasksOrderBy,
  allTasksWhere,
  ownerCounts,
  personOfLegacyName,
  personRefs,
  propertyCounts,
  viewScopeWhere,
  TASK_VIEWS,
  type AllFilters,
  type LegacyNames,
  type TaskView,
} from "./list-query";

/**
 * Staff read queries for the task lists: Today (on Home) and All. Staff only;
 * the portal has its own queries in src/lib/portal (auth-guard.test.ts keeps
 * portal code out of here). Every list leaves out Template rows.
 */

const LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  scheduledFor: true,
  waitingOn: true,
  unitLabel: true,
  assigneeName: true,
  createdAt: true,
  property: { select: { id: true, address: true } },
  deal: { select: { address: true } },
  assignee: { select: { id: true, name: true, email: true } },
  // Whether they can sign in (list.ts hasPortalLogin), so Today's Send back promises the note only when it reaches them.
  assigneeContact: { select: { id: true, fullName: true, active: true, portalAccount: { select: { status: true } } } },
  repeatRule: true,
} satisfies Prisma.TaskSelect;

/** The rows with something new for this partner since they last opened them get `unread` (activity 3.5 A). */
async function withUnread(userId: string, tasks: ListTask[]): Promise<ListTask[]> {
  if (tasks.length === 0) return tasks;
  const unread = await unreadTaskIds(userId, tasks.map((t) => t.id));
  return unread.size === 0 ? tasks : tasks.map((t) => (unread.has(t.id) ? { ...t, unread: true } : t));
}

/**
 * Everything Today shows, for either partner: their own active tasks, every
 * active contractor job (D8), and every active task nobody owns. An imported
 * name that stands for a person on offer is marked with them
 * (withLegacyPeople), by the people the Tasks filter matches against.
 * Grouping happens in list.ts (groupMine, groupContractors).
 */
export async function todayTasks(userId: string): Promise<ListTask[]> {
  const [rows, { users, contractors, archived }] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...activeTask,
        ...excludeTemplateTasks,
        OR: [{ assigneeUserId: userId }, { assigneeContactId: { not: null } }, { assigneeUserId: null, assigneeContactId: null }],
      },
      select: LIST_SELECT,
    }),
    assigneeOptions(),
  ]);
  return withUnread(userId, withLegacyPeople(rows.map(toListTask), personRefs(users, contractors, archived)));
}

/** What the Property and Assignee sorts read from every matching row (list-sort.ts SortRow). */
const SORT_SELECT = {
  id: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  propertyId: true,
  property: { select: { address: true } },
  deal: { select: { address: true } },
  assignee: { select: { id: true, name: true, email: true } },
  assigneeContact: { select: { id: true, fullName: true } },
  assigneeName: true,
} satisfies Prisma.TaskSelect;

type SortRecord = Prisma.TaskGetPayload<{ select: typeof SORT_SELECT }>;

/** A row's sort keys: its building and its person as the list shows them, an imported name merged into its person. */
function sortRowOf(r: SortRecord, known: ReadonlyMap<string, string>, nameOf: ReadonlyMap<string, string>): SortRow {
  const place = shortAddress(r.property?.address ?? r.deal?.address) || null;
  const legacyKey = !r.assignee && !r.assigneeContact && r.assigneeName ? known.get(r.assigneeName) : undefined;
  const assignee: ListAssignee | null = r.assignee
    ? { kind: "user", id: r.assignee.id, name: r.assignee.name, email: r.assignee.email }
    : r.assigneeContact
      ? { kind: "contact", id: r.assigneeContact.id, name: r.assigneeContact.fullName }
      : r.assigneeName
        ? { kind: "name", name: r.assigneeName, person: legacyKey ? { key: legacyKey, name: nameOf.get(legacyKey) ?? r.assigneeName } : undefined }
        : null;
  return {
    id: r.id,
    due: toYmd(r.dueDate),
    finished: r.completedAt?.toISOString() ?? null,
    created: r.createdAt.toISOString(),
    place,
    placeKey: placeKey({ propertyId: r.propertyId, place }),
    person: personName(assignee),
    personKey: personKey(assignee),
  };
}

/**
 * The Tasks page: the rows the view, picks and search leave, in the list's
 * sort (list-sort.ts), at most `take` of them, plus the full count and, for
 * the Property and Assignee sorts, how many rows each heading holds. The Due
 * sort is a database order; the other two read every matching row's keys,
 * sort them here (street order and names from three places can't be done in
 * SQL) and load the page's rows by id. Imported names are merged into the
 * person they stand for, as the filter counts them (`legacy`). With
 * `viewerId`, the rows new to that partner are marked `unread`.
 */
export async function allTasks(
  f: AllFilters,
  take: number,
  legacy: LegacyNames,
  { sort, people, viewerId }: { sort: TaskSort; people: readonly PersonRef[]; viewerId?: string },
): Promise<{ tasks: ListTask[]; total: number; groups: Record<string, number> }> {
  const where = allTasksWhere(f, legacy);
  const known = personOfLegacyName(legacy);
  const finish = (rows: Prisma.TaskGetPayload<{ select: typeof LIST_SELECT }>[]) => {
    const list = withLegacyPeople(rows.map(toListTask), people, known);
    return viewerId ? withUnread(viewerId, list) : list;
  };

  if (sort.field === "due") {
    // The unread check starts as soon as the rows are in, beside the count.
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({ where, orderBy: allTasksOrderBy(f.status, sort), take, select: LIST_SELECT }).then(finish),
      prisma.task.count({ where }),
    ]);
    return { tasks, total, groups: {} };
  }

  const nameOf = new Map(people.map((p) => [p.key, p.name]));
  const keys = await prisma.task.findMany({ where, select: SORT_SELECT });
  const sorted = sortRows(
    keys.map((r) => sortRowOf(r, known, nameOf)),
    sort,
    f.status,
  );
  const ids = sorted.slice(0, take).map((r) => r.id);
  const at = new Map(ids.map((id, i) => [id, i]));
  const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: LIST_SELECT });
  rows.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
  return { tasks: await finish(rows), total: keys.length, groups: groupCounts(sorted, sort.field) };
}

/** How many tasks the filters leave: the number on the Filters sheet's "Show 13 tasks". */
export async function countAllTasks(f: AllFilters, legacy: LegacyNames): Promise<number> {
  return prisma.task.count({ where: allTasksWhere(f, legacy) });
}

/**
 * The numbers beside the Tasks filters: per assignee and per property, what
 * picking each would show with every other filter still on (so a row that
 * leads nowhere reads 0), and `scope`, every task in the view, which "hidden
 * by filters" is measured against.
 */
export async function taskFilterCounts(
  f: AllFilters,
  legacy: LegacyNames,
): Promise<{ owner: Map<string, number>; property: Map<string, number>; scope: number }> {
  const [ownerRows, propertyRows, scope] = await Promise.all([
    prisma.task.groupBy({
      by: ["assigneeUserId", "assigneeContactId", "assigneeName"],
      where: allTasksWhere(f, legacy, "owner"),
      _count: { _all: true },
    }),
    prisma.task.groupBy({ by: ["propertyId"], where: allTasksWhere(f, legacy, "property"), _count: { _all: true } }),
    prisma.task.count({ where: viewScopeWhere(f.status) }),
  ]);
  return {
    owner: ownerCounts(
      ownerRows.map((r) => ({ ...r, count: r._count._all })),
      legacy,
    ),
    property: propertyCounts(propertyRows.map((r) => ({ propertyId: r.propertyId, count: r._count._all }))),
    scope,
  };
}

/** Tasks per view for the current search and picks: the counts on Open, Done and All while a query is typed. */
export async function taskViewCounts(f: AllFilters, legacy: LegacyNames): Promise<Record<TaskView, number>> {
  const counts = await Promise.all(TASK_VIEWS.map((status) => prisma.task.count({ where: allTasksWhere({ ...f, status }, legacy) })));
  return Object.fromEntries(TASK_VIEWS.map((v, i) => [v, counts[i]])) as Record<TaskView, number>;
}

/**
 * The free-text assignee names the Asana import left behind, once each, and
 * which of them are a person on offer (mergeLegacyNames): the Tasks filter
 * lists the people, and "Others" for names that are nobody it can name.
 */
export async function legacyAssignees(
  people: readonly PersonRef[] | Promise<readonly PersonRef[]>,
): Promise<{ merged: LegacyNames; others: string[] }> {
  // The names are read while the people are still loading, when the caller passes them as a promise.
  const [rows, refs] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeUserId: null, assigneeContactId: null, assigneeName: { not: null }, ...excludeTemplateTasks },
      select: { assigneeName: true },
      distinct: ["assigneeName"],
      orderBy: { assigneeName: "asc" },
    }),
    people,
  ]);
  const names = rows.map((t) => t.assigneeName).filter((n): n is string => !!n);
  const { merged, others } = mergeLegacyNames(names, refs);
  const byPerson = new Map<string, string[]>();
  for (const [name, key] of merged) byPerson.set(key, [...(byPerson.get(key) ?? []), name]);
  return { merged: byPerson, others };
}

/**
 * True once today's emails, Buffalo time, reached the daily cap (D30): Home
 * shows staff a banner, since the rest wait for tomorrow. Counted by the send
 * run's own rule (notifications/sent-count.ts sentSince), so a row closed
 * unsent never counts and a password reset that went does.
 */
export async function emailCapReached(today: Ymd): Promise<boolean> {
  return (await sentSince(prisma, easternDayStart(today))) >= DAILY_EMAIL_CAP;
}

/**
 * Which legacy names stand for the people a filter picks, for the Filters
 * sheet's count: only asked of the database when a person, or Unassigned
 * (which leaves those names out), is picked.
 */
export async function legacyNamesFor(owner: readonly string[]): Promise<LegacyNames> {
  if (!owner.some((k) => k.startsWith("u:") || k.startsWith("c:") || k === NONE)) return new Map();
  // The people the page lists: the team, the active contractors, and any inactive one picked.
  const { users, contractors, archived } = await assigneeOptions(owner.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)));
  return (await legacyAssignees(personRefs(users, contractors, archived))).merged;
}
