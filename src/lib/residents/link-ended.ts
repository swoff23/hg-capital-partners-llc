import type { Prisma } from "@prisma/client";
import type { LinkEnded } from "./steps";

type Db = Pick<Prisma.TransactionClient, "residentLink">;

/**
 * Why a link that no longer works stopped (docs/specs/tenant-welcome-email.md, Q1), for the page it opens: replaced
 * when a newer link for the same person and lease was emailed and still works, so "Use the newest email from HG
 * Capital." leads somewhere; gone otherwise (turned off with nothing newer sent, or they moved out or came off the
 * lease, `leaseCurrent` false). No server-only, so links.pg.test.ts runs it on a scratch database.
 */
export async function whyLinkEnded(db: Db, link: { id: string; tenantId: string; leaseId: string; createdAt: Date }, leaseCurrent: boolean): Promise<LinkEnded> {
  if (!leaseCurrent) return "gone";
  const newer = await db.residentLink.count({
    where: { tenantId: link.tenantId, leaseId: link.leaseId, id: { not: link.id }, createdAt: { gt: link.createdAt }, emailedAt: { not: null }, revokedAt: null },
  });
  return newer > 0 ? "replaced" : "gone";
}
