import "server-only";
import { prisma } from "@/lib/db";
import type { AssigneeContractor, AssigneeUser } from "@/components/assignee-picker";

/**
 * Who the assignee picker offers: the team (staff users), then contractors:
 * active contacts with a trade or any job, plus anyone in `include` (the
 * current assignee, even if inactive). `hasLogin` marks an active portal
 * login. Never selects a password hash.
 */
export async function assigneeOptions(include: (string | null | undefined)[] = []): Promise<{
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
}> {
  const extra = include.filter((x): x is string => !!x);
  const [users, contacts] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({
      where: {
        OR: [
          { active: true, OR: [{ trades: { not: null } }, { assignedTasks: { some: {} } }] },
          ...(extra.length ? [{ id: { in: extra } }] : []),
        ],
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, trades: true, portalAccount: { select: { status: true } } },
    }),
  ]);
  return {
    users,
    contractors: contacts.map((c) => ({
      id: c.id,
      name: c.fullName,
      trade: c.trades?.trim() || null,
      hasLogin: c.portalAccount?.status === "ACTIVE",
    })),
  };
}
