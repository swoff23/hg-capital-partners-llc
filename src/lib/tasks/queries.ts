import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysYmd } from "@/lib/quick-dates";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { easternDayStart, type Ymd } from "@/lib/dates";
import { mergeLegacyNames, type PersonRef } from "./assignee-people";
import { assigneeOptions } from "./assignee-options";
import { EMAIL_DAILY_CAP, toListTask, withLegacyPeople, type ListTask } from "./list";
import { unreadTaskIds } from "./read-state";
import {
  NONE,
  allTasksOrderBy,
  allTasksWhere,
  ownerCounts,
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
  const [rows, { users, contractors }] = await Promise.all([
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
  return withUnread(userId, withLegacyPeople(rows.map(toListTask), personRefs(users, contractors)));
}

/**
 * The Tasks page: the rows the view, picks and search leave, in their order
 * (list-query.ts), at most `take` of them, plus the full count. With
 * `viewerId`, the rows new to that partner are marked `unread`.
 */
export async function allTasks(
  f: AllFilters,
  take: number,
  legacy: LegacyNames,
  viewerId?: string,
): Promise<{ tasks: ListTask[]; total: number }> {
  const where = allTasksWhere(f, legacy);
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy: allTasksOrderBy(f.status), take, select: LIST_SELECT }),
    prisma.task.count({ where }),
  ]);
  const tasks = rows.map(toListTask);
  return { tasks: viewerId ? await withUnread(viewerId, tasks) : tasks, total };
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
  people: readonly PersonRef[],
): Promise<{ merged: LegacyNames; others: string[] }> {
  const rows = await prisma.task.findMany({
    where: { assigneeUserId: null, assigneeContactId: null, assigneeName: { not: null }, ...excludeTemplateTasks },
    select: { assigneeName: true },
    distinct: ["assigneeName"],
    orderBy: { assigneeName: "asc" },
  });
  const names = rows.map((t) => t.assigneeName).filter((n): n is string => !!n);
  const { merged, others } = mergeLegacyNames(names, people);
  const byPerson = new Map<string, string[]>();
  for (const [name, key] of merged) byPerson.set(key, [...(byPerson.get(key) ?? []), name]);
  return { merged: byPerson, others };
}

/**
 * True once 100 or more notification emails went out today, Buffalo time
 * (D30): Today shows staff a banner, since the rest wait for tomorrow.
 */
export async function emailCapReached(today: Ymd): Promise<boolean> {
  const sent = await prisma.notificationOutbox.count({
    where: { sentAt: { gte: easternDayStart(today), lt: easternDayStart(addDaysYmd(today, 1)!) } },
  });
  return sent >= EMAIL_DAILY_CAP;
}

/**
 * Which legacy names stand for the people a filter picks, for the Filters
 * sheet's count: only asked of the database when a person, or Unassigned
 * (which leaves those names out), is picked.
 */
export async function legacyNamesFor(owner: readonly string[]): Promise<LegacyNames> {
  if (!owner.some((k) => k.startsWith("u:") || k.startsWith("c:") || k === NONE)) return new Map();
  // The people the page lists: the team, the active contractors, and any inactive one picked.
  const { users, contractors } = await assigneeOptions(owner.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)));
  return (await legacyAssignees(personRefs(users, contractors))).merged;
}
