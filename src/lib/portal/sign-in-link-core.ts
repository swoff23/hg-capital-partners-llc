import type { Prisma } from "@prisma/client";
import { logSecurityEvent } from "./accounts-core";
import { SIGN_IN_LINK_LIMITS, resetTokenExpiresAt, resetWindowStart, signInLinkExpiresAt } from "./limits";
import { hashToken, isWellFormedToken, newToken } from "./tokens";

/**
 * "Email me a sign-in link" (docs/specs/contractor-scheduled-date.md section
 * 12, Connor's option A, Nov 22). A contractor who opened a job from their
 * job email, and so has a session that opens that one job, taps back and
 * lands on Welcome back. Asking for a link from there emails one to the
 * login's own address, never to one typed in, so a forwarded job email
 * can't be used to reach the rest of their jobs. The link works once, for 15
 * minutes, and opens a full session.
 *
 * The parts that take the client or a transaction, with no `server-only`, so
 * sign-in-link.pg.test.ts runs them. sign-in-link.ts sends the email and
 * starts the session.
 */

type Tx = Prisma.TransactionClient;

/** Advisory-lock namespace (pg_advisory_xact_lock's first key), apart from reset.ts's 7301 and 7302. */
const SIGN_IN_LINK_LOCK = 7303;

/** What a SIGN_IN_LINK_REQUESTED event holds: `sent` turns true once the email went, as a reset request's does. */
export type SignInLinkRequestData = { accountId: string; sent: boolean };

export type SignInLinkRequest = { token: string; eventId: string; data: SignInLinkRequestData; email: string; name: string };

/**
 * Make a link for this login and write its audit row, under a per-login lock
 * held to commit, so a burst of taps is counted one at a time: 3 an hour.
 * Null when the limit is reached or the login can't sign in (disabled, or
 * its contractor archived); the caller answers the same either way.
 */
export async function requestSignInLinkTx(
  tx: Tx,
  r: { accountId: string; ipHash: string | null; now: Date },
): Promise<SignInLinkRequest | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SIGN_IN_LINK_LOCK}::int, hashtext(${r.accountId}))`;
  const account = await tx.portalAccount.findUnique({
    where: { id: r.accountId },
    select: { id: true, email: true, status: true, contactId: true, contact: { select: { active: true, fullName: true } } },
  });
  if (!account || account.status !== "ACTIVE" || !account.contact.active) return null;
  const recent = await tx.securityEvent.count({
    where: {
      kind: "SIGN_IN_LINK_REQUESTED",
      createdAt: { gte: resetWindowStart(r.now, SIGN_IN_LINK_LIMITS.windowMs) },
      data: { path: ["accountId"], equals: account.id },
    },
  });
  if (recent >= SIGN_IN_LINK_LIMITS.perAccount) return null;

  const token = newToken();
  await tx.portalSignInLink.create({ data: { accountId: account.id, tokenHash: hashToken(token), expiresAt: signInLinkExpiresAt(r.now) } });
  const data: SignInLinkRequestData = { accountId: account.id, sent: false };
  const event = await logSecurityEvent(tx, { kind: "SIGN_IN_LINK_REQUESTED", contactId: account.contactId, ipHash: r.ipHash, data });
  return { token, eventId: event.id, data, email: account.email, name: account.contact.fullName };
}

const LINK_SELECT = {
  id: true,
  usedAt: true,
  expiresAt: true,
  account: { select: { id: true, email: true, status: true, mustChangePassword: true, contactId: true, contact: { select: { active: true, fullName: true } } } },
} satisfies Prisma.PortalSignInLinkSelect;

type LinkRow = Prisma.PortalSignInLinkGetPayload<{ select: typeof LINK_SELECT }>;

/** A sign-in link that still works, and whose login it opens. */
export type UsableSignInLink = { linkId: string; accountId: string; contactId: string; email: string; name: string; mustChangePassword: boolean };

/** The row's login, or null once the link is used, past its 15 minutes, or for a login that can't sign in. */
export function usableSignInLink(row: LinkRow | null, now: Date): UsableSignInLink | null {
  if (!row || row.usedAt || row.expiresAt <= now) return null;
  const a = row.account;
  if (a.status !== "ACTIVE" || !a.contact.active) return null;
  return { linkId: row.id, accountId: a.id, contactId: a.contactId, email: a.email, name: a.contact.fullName, mustChangePassword: a.mustChangePassword };
}

/** For the link's page: does it still work, and for whom? Read-only, so an email scanner opening it spends nothing. */
export async function findSignInLink(db: Pick<Tx, "portalSignInLink">, token: string, now: Date): Promise<UsableSignInLink | null> {
  if (!isWellFormedToken(token)) return null;
  return usableSignInLink(await db.portalSignInLink.findUnique({ where: { tokenHash: hashToken(token) }, select: LINK_SELECT }), now);
}

/**
 * Spend the link: only one of two racing taps gets count 1. Its login's other
 * unused links go with it, so an older email can't sign in afterwards.
 * Null when it no longer works.
 */
export async function spendSignInLinkTx(tx: Tx, token: string, now: Date): Promise<UsableSignInLink | null> {
  const link = await findSignInLink(tx, token, now);
  if (!link) return null;
  const spent = await tx.portalSignInLink.updateMany({ where: { id: link.linkId, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (spent.count !== 1) return null;
  await tx.portalSignInLink.updateMany({ where: { accountId: link.accountId, usedAt: null }, data: { usedAt: now } });
  return link;
}

export type SignInLinkResult =
  | { kind: "signed-in"; link: UsableSignInLink }
  /** A login still on its starting password: the link proved the inbox, as a reset link does, so it chooses one. */
  | { kind: "choose-password"; resetToken: string };

/**
 * Spend the link, or null when it no longer works. A login that has chosen
 * its password is signed in: the caller starts the session, and here it
 * counts as a sign-in (the login's lastSignInAt and a SIGN_IN_OK row). A
 * login still on its starting password, which it may never have been told,
 * gets a reset link of its own instead, so the next page is Choose a new
 * password, which asks for no old one (reset.ts finishPasswordReset clears
 * the starting-password flag).
 */
export async function finishSignInLinkTx(tx: Tx, token: string, ipHash: string | null, now: Date): Promise<SignInLinkResult | null> {
  const used = await spendSignInLinkTx(tx, token, now);
  if (!used) return null;
  if (used.mustChangePassword) {
    const resetToken = newToken();
    await tx.passwordResetToken.create({ data: { accountId: used.accountId, tokenHash: hashToken(resetToken), expiresAt: resetTokenExpiresAt(now) } });
    return { kind: "choose-password", resetToken };
  }
  await tx.portalAccount.update({ where: { id: used.accountId }, data: { lastSignInAt: now } });
  await logSecurityEvent(tx, { kind: "SIGN_IN_OK", contactId: used.contactId, ipHash, data: { by: "sign-in-link" } });
  return { kind: "signed-in", link: used };
}

