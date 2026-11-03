import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isArchived } from "@/lib/record-scope";
import { cleanTrades } from "@/lib/contacts";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { recentAssigneeKeys } from "./assignee-people";

const isLive = (c: { archivedAt: Date | null }) => !isArchived(c);

/** How many "Recent" people the picker shows while its search is empty. */
const RECENT = 3;

/**
 * Who the assignee picker offers: the team (staff users), then contractors:
 * active contacts with a trade or any job who aren't archived, plus anyone in
 * `include` (the current assignee, even if inactive or archived). `hasLogin` marks an active portal
 * login. Never selects a password hash.
 *
 * `archived` is who the contractors would also hold but for Archive. They are
 * never offered; the legacy-name matching reads them (list-query.ts
 * personRefs), so an imported "Zack" that is an archived Zack isn't filed
 * under a live one, and goes to Others.
 *
 * With `viewerId`, `recent` is the (up to 3) people that viewer assigned most
 * recently, newest first, from their own ASSIGNED events and the assignee they
 * gave a task when they created it (its CREATED line's `to`, core.ts
 * createTask), so the picker's Recent rows follow them across devices
 * (selectors 3.3). Without it `recent` is empty and the picker shows no Recent
 * section.
 */
export async function assigneeOptions(
  include: (string | null | undefined)[] = [],
  viewerId?: string,
): Promise<{
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  recent: AssigneeValue[];
  archived: { id: string; name: string; email: string | null }[];
}> {
  const extra = include.filter((x): x is string => !!x);
  const [users, contacts, events] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({
      where: {
        OR: [
          // Archived ones too, for `archived`; they are split off below.
          { active: true, OR: [{ trades: { not: null } }, { assignedTasks: { some: {} } }] },
          ...(extra.length ? [{ id: { in: extra } }] : []),
        ],
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, trades: true, archivedAt: true, portalAccount: { select: { status: true } } },
    }),
    viewerId
      ? prisma.taskEvent.findMany({
          where: {
            actorUserId: viewerId,
            deletedAt: null,
            // A CREATED line with no `to` assigned no one; leaving those out keeps them from crowding the window below.
            OR: [{ kind: "ASSIGNED" }, { kind: "CREATED", data: { path: ["to"], not: Prisma.DbNull } }],
          },
          orderBy: { createdAt: "desc" },
          // Enough that three distinct people turn up even when one gets most of the jobs.
          take: 60,
          select: { data: true },
        })
      : [],
  ]);
  const offer = (c: { id: string; archivedAt: Date | null }) => isLive(c) || extra.includes(c.id);
  const archived = contacts.filter((c) => !offer(c)).map((c) => ({ id: c.id, name: c.fullName, email: c.email }));
  const contractors = contacts.filter(offer).map((c) => ({
    id: c.id,
    name: c.fullName,
    email: c.email,
    trade: cleanTrades(c.trades),
    hasLogin: c.portalAccount?.status === "ACTIVE",
  }));

  const offered = new Set([...users.map((u) => `u:${u.id}`), ...contractors.map((c) => `c:${c.id}`)]);
  const recent = recentAssigneeKeys(events, offered, RECENT).map((key): AssigneeValue => (key.startsWith("u:") ? { userId: key.slice(2) } : { contactId: key.slice(2) }));
  return { users, contractors, recent, archived };
}
