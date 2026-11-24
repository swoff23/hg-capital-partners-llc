import "server-only";
import type { JobLinkKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isActiveStatus } from "@/lib/task-scope";
import { hashToken, isWellFormedToken, newToken } from "./tokens";

/**
 * Links in job emails (docs/specs/contractor-job-emails.md, section 3).
 *
 * Each email gets its own token; the database keeps only its SHA-256, as for
 * sessions and reset links (tokens.ts). A contractor's EMAIL link opens that
 * one job as them, lockbox included, until the job closes or they lose it; a
 * CREW link is the same, minted for "Share with crew" so the log tells them
 * apart; a partner's STAFF link only shows the email's photos. Remove access
 * and Sign out everywhere revoke a contractor's links (revokeJobLinksFor).
 * The pure half (paths, what a link session may open) is job-link-paths.ts.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A new link for one job and one person. Returns the token, which goes only into the email. A partner's link may also
 * name a contractor: a REPLY link's is the contractor the email was about (docs/specs/emails-redesign.md, section 7),
 * so a reply about someone who has since left the job can be told apart. It is still the partner's link.
 */
export async function mintJobLink(
  db: Db,
  input: { taskId: string; kind: JobLinkKind } & ({ contactId: string; userId?: never } | { userId: string; contactId?: string | null }),
): Promise<string> {
  const token = newToken();
  await db.jobLink.create({
    data: { tokenHash: hashToken(token), kind: input.kind, taskId: input.taskId, contactId: input.contactId ?? null, userId: input.userId ?? null },
  });
  return token;
}

export type ResolvedJobLink = {
  id: string;
  kind: JobLinkKind;
  taskId: string;
  contactId: string | null;
  userId: string | null;
  /**
   * A contractor's EMAIL or CREW link that still opens the job: the contact is active with an ACTIVE login and an
   * unrevoked access row (as core.ts assertContractorAccess asks), and the job is still open. False for STAFF and REPLY.
   */
  opensJob: boolean;
  /** The contractor's login, for the session a link starts. */
  accountId: string | null;
};

/** The link a token names, or null when it's malformed, unknown or revoked. Whether it still opens the job is `opensJob`. */
export async function resolveJobLink(token: string): Promise<ResolvedJobLink | null> {
  if (!isWellFormedToken(token)) return null;
  const link = await prisma.jobLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      kind: true,
      taskId: true,
      contactId: true,
      userId: true,
      revokedAt: true,
      task: { select: { status: true } },
      contact: {
        select: {
          active: true,
          portalAccount: { select: { id: true, status: true } },
          taskAccess: { where: { revokedAt: null }, select: { taskId: true } },
        },
      },
    },
  });
  if (!link || link.revokedAt) return null;
  const contact = link.contact;
  const account = contact?.portalAccount ?? null;
  // Only the button links open the job. A STAFF link shows photos; a REPLY link (the email's reply address, which
  // travels in To and CC lines and address books) only lets a reply post (spec section 5).
  const opensJob =
    (link.kind === "EMAIL" || link.kind === "CREW") &&
    !!contact?.active &&
    account?.status === "ACTIVE" &&
    contact.taskAccess.some((a) => a.taskId === link.taskId) &&
    isActiveStatus(link.task.status);
  // A partner's link that names a contractor (a reply link, mintJobLink) is the partner's: it never starts their session.
  return { id: link.id, kind: link.kind, taskId: link.taskId, contactId: link.contactId, userId: link.userId, opensJob: opensJob && !link.userId, accountId: link.userId ? null : (account?.id ?? null) };
}

/** Note when a link was last used. Never throws: a failed note doesn't stop the job opening. */
export async function touchJobLink(id: string, now = new Date()): Promise<void> {
  await prisma.jobLink.updateMany({ where: { id }, data: { lastUsedAt: now } }).catch(() => undefined);
}

/**
 * Remove access and Sign out everywhere: every link in the contractor's emails stops. Returns how many. A partner's
 * link that only names them (a reply link about their job) is the partner's and keeps working.
 */
export async function revokeJobLinksFor(db: Db, contactId: string, at: Date = new Date()): Promise<number> {
  const { count } = await db.jobLink.updateMany({ where: { contactId, userId: null, revokedAt: null }, data: { revokedAt: at } });
  return count;
}
