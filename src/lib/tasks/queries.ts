import "server-only";
import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysYmd } from "@/lib/quick-dates";
import { activeTask, closedTask, excludeTemplateTasks } from "@/lib/task-scope";
import { easternDayStart, type Ymd } from "@/lib/dates";
import { EMAIL_DAILY_CAP, toListTask, type ListTask } from "./list";

/**
 * Staff read queries for the task lists: Today, All, Home's card. Staff only;
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
  assigneeContact: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskSelect;

/**
 * Everything Today shows, for either partner: their own active tasks, every
 * active contractor job (D8), and every active task nobody owns.
 * Grouping happens in list.ts (groupMine, groupContractors).
 */
export async function todayTasks(userId: string): Promise<ListTask[]> {
  const rows = await prisma.task.findMany({
    where: {
      ...activeTask,
      ...excludeTemplateTasks,
      OR: [{ assigneeUserId: userId }, { assigneeContactId: { not: null } }, { assigneeUserId: null, assigneeContactId: null }],
    },
    select: LIST_SELECT,
  });
  return rows.map(toListTask);
}

/** Home's "My open tasks": the signed-in partner's active tasks, soonest first. */
export async function myOpenTasks(userId: string, take: number): Promise<ListTask[]> {
  const rows = await prisma.task.findMany({
    where: { assigneeUserId: userId, ...activeTask, ...excludeTemplateTasks },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take,
    select: LIST_SELECT,
  });
  return rows.map(toListTask);
}

export interface AllFilters {
  /** "open" (the default), "done" (Done and Canceled) or "all". */
  status: string;
  /** "u:<userId>", "c:<contactId>", "n:<legacy name>", "none", or "" for anyone. */
  owner: string;
  property: string;
  q: string;
}

function ownerWhere(owner: string): Prisma.TaskWhereInput {
  if (owner.startsWith("u:")) return { assigneeUserId: owner.slice(2) };
  if (owner.startsWith("c:")) return { assigneeContactId: owner.slice(2) };
  if (owner.startsWith("n:")) return { assigneeName: owner.slice(2), assigneeUserId: null, assigneeContactId: null };
  // Same as Today's Unassigned: no real person, so legacy free-text names count too.
  if (owner === "none") return { assigneeUserId: null, assigneeContactId: null };
  return {};
}

/** The All tab: filtered, soonest due first, at most `take` rows plus the full count. */
export async function allTasks(f: AllFilters, take: number): Promise<{ tasks: ListTask[]; total: number }> {
  const where: Prisma.TaskWhereInput = {
    ...excludeTemplateTasks,
    ...(f.status === "done" ? closedTask : f.status === "all" ? {} : activeTask),
    ...ownerWhere(f.owner),
    ...(f.property ? { propertyId: f.property } : {}),
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take,
      select: LIST_SELECT,
    }),
    prisma.task.count({ where }),
  ]);
  return { tasks: rows.map(toListTask), total };
}

/** The pickers behind the All tab's assignee and property filters. */
export async function listFilterOptions() {
  const [users, contacts, legacyNames, properties] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({ where: { active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.task.findMany({
      where: { assigneeUserId: null, assigneeContactId: null, assigneeName: { not: null }, ...excludeTemplateTasks },
      select: { assigneeName: true },
      distinct: ["assigneeName"],
      orderBy: { assigneeName: "asc" },
    }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
  ]);
  return {
    users,
    contacts,
    legacyNames: legacyNames.map((t) => t.assigneeName).filter((n): n is string => !!n),
    properties,
  };
}

/** A task's status right now, for actions that only make sense from one status. */
export async function taskStatus(id: string): Promise<TaskStatus | null> {
  const t = await prisma.task.findUnique({ where: { id }, select: { status: true } });
  return t?.status ?? null;
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
