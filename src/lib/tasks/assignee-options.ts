import "server-only";
import { prisma } from "@/lib/db";
import { cleanTrades } from "@/lib/contacts";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { recentAssigneeKeys } from "./assignee-people";

/** How many "Recent" people the picker shows while its search is empty. */
const RECENT = 3;

/**
 * Who the assignee picker offers: the team (staff users), then contractors:
 * active contacts with a trade or any job, plus anyone in `include` (the
 * current assignee, even if inactive). `hasLogin` marks an active portal
 * login. Never selects a password hash.
 *
 * With `viewerId`, `recent` is the (up to 3) people that viewer assigned most
 * recently, newest first, from their own ASSIGNED events, so the picker's
 * Recent rows follow them across devices (selectors 3.3). Without it `recent`
 * is empty and the picker shows no Recent section.
 */
export async function assigneeOptions(
  include: (string | null | undefined)[] = [],
  viewerId?: string,
): Promise<{
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  recent: AssigneeValue[];
}> {
  const extra = include.filter((x): x is string => !!x);
  const [users, contacts, events] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({
      where: {
        OR: [
          { active: true, OR: [{ trades: { not: null } }, { assignedTasks: { some: {} } }] },
          ...(extra.length ? [{ id: { in: extra } }] : []),
        ],
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, trades: true, portalAccount: { select: { status: true } } },
    }),
    viewerId
      ? prisma.taskEvent.findMany({
          where: { kind: "ASSIGNED", actorUserId: viewerId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          // Enough that three distinct people turn up even when one gets most of the jobs.
          take: 60,
          select: { data: true },
        })
      : [],
  ]);
  const contractors = contacts.map((c) => ({
    id: c.id,
    name: c.fullName,
    email: c.email,
    trade: cleanTrades(c.trades),
    hasLogin: c.portalAccount?.status === "ACTIVE",
  }));

  const offered = new Set([...users.map((u) => `u:${u.id}`), ...contractors.map((c) => `c:${c.id}`)]);
  const recent = recentAssigneeKeys(events, offered, RECENT).map((key): AssigneeValue => (key.startsWith("u:") ? { userId: key.slice(2) } : { contactId: key.slice(2) }));
  return { users, contractors, recent };
}
