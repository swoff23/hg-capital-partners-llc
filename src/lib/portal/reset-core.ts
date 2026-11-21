import type { Prisma, PrismaClient } from "@prisma/client";
import { endConnectionsForPasswordReset } from "@/lib/claude/connections-core";
import type { EmailMessage } from "@/lib/email/resend";
import type { SendResult } from "@/lib/email/send";
import { logSecurityEvent } from "./accounts-core";

/**
 * The parts of reset.ts that take the client (or a transaction) and the
 * sender as arguments, with no `server-only`, so they can be tested.
 * reset.ts re-reads nothing here: it hands over the rows it has.
 */

type Tx = Prisma.TransactionClient;

/**
 * What a PASSWORD_RESET_REQUESTED event holds. The request writes `sent:
 * false` for every address, known or not, inside its locked transaction (the
 * hourly limits count these rows by emailHash and ipHash whatever `sent`
 * says). Only deliverResetEmail sets it true, once the email went, so a send
 * that fails, or never runs, spends nothing of the daily email cap
 * (notifications/sent-count.ts).
 */
export type ResetRequestData = { emailHash: string; sent: boolean };

/**
 * Who a reset link belongs to: a contractor login, or a staff User
 * (docs/specs/staff-password-reset.md).
 */
export type ResetOwner = { kind: "contractor"; accountId: string } | { kind: "staff"; userId: string };

/**
 * Who a "Forgot password" request for this email (already normalized) would
 * reach, and who to name on the request's event.
 *
 * A contractor login gets a link while it's active and its contractor is. A
 * staff User gets one only while it has a password: clearing the password is
 * how a staff login is turned off (src/lib/auth.ts), so Forgot password never
 * sets a first one. An email is never both (accounts-core.ts checks when a
 * contractor login is made or its email changes); the contractor login is
 * looked up first, as before staff could reset.
 */
export async function findResetOwner(
  db: Pick<Tx, "portalAccount" | "user">,
  email: string,
): Promise<{ owner: ResetOwner | null; contactId: string | null; userId: string | null }> {
  const account = await db.portalAccount.findUnique({
    where: { email },
    select: { id: true, contactId: true, status: true, contact: { select: { active: true } } },
  });
  if (account) {
    const usable = account.status === "ACTIVE" && account.contact.active;
    return { owner: usable ? { kind: "contractor", accountId: account.id } : null, contactId: account.contactId, userId: null };
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!user) return { owner: null, contactId: null, userId: null };
  return { owner: user.passwordHash ? { kind: "staff", userId: user.id } : null, contactId: null, userId: user.id };
}

/** A new token row's owner column: exactly one of the two, as the table's CHECK requires. */
export function resetTokenOwner(owner: ResetOwner): { accountId: string } | { userId: string } {
  return owner.kind === "contractor" ? { accountId: owner.accountId } : { userId: owner.userId };
}

/** What a reset link's check reads off its token row. */
export const RESET_TOKEN_SELECT = {
  id: true,
  usedAt: true,
  expiresAt: true,
  account: { select: { id: true, email: true, contactId: true, status: true, contact: { select: { active: true } } } },
  user: { select: { id: true, email: true, passwordHash: true } },
} satisfies Prisma.PasswordResetTokenSelect;

export type ResetTokenRow = Prisma.PasswordResetTokenGetPayload<{ select: typeof RESET_TOKEN_SELECT }>;

/** A reset link that still works, and whose login it sets. Never the password hash. */
export type UsableReset =
  | { tokenId: string; email: string; kind: "contractor"; accountId: string; contactId: string }
  | { tokenId: string; email: string; kind: "staff"; userId: string };

/**
 * The token row's login, or null when the link no longer works: used, past
 * its 30 minutes, or for a login that can't sign in any more (a disabled
 * contractor, or a staff User whose password was cleared).
 */
export function usableReset(row: ResetTokenRow | null, now: Date): UsableReset | null {
  if (!row || row.usedAt || row.expiresAt <= now) return null;
  if (row.account) {
    if (row.account.status !== "ACTIVE" || !row.account.contact.active) return null;
    return { tokenId: row.id, email: row.account.email, kind: "contractor", accountId: row.account.id, contactId: row.account.contactId };
  }
  if (row.user?.passwordHash) return { tokenId: row.id, email: row.user.email, kind: "staff", userId: row.user.id };
  return null;
}

/** A racing submission used the link first, or the login was turned off since it was checked. */
export class ResetTokenTaken extends Error {}

/**
 * Save a staff reset inside the caller's transaction: use up the link (only
 * one of two racing submissions gets count 1), set the new password and
 * passwordChangedAt, end the user's Claude connection, end their other open
 * links, and log it. Setting passwordChangedAt is what signs the partner out
 * everywhere: src/lib/auth.ts turns away any session cookie issued before it.
 * Their Claude ends with those sessions, here and not only by that date: the
 * connection is marked ended and its tokens deleted in this same transaction
 * (docs/specs/tasks-from-claude.md 7.3). Their connector address is kept, so
 * Claude only has to sign in again. Throws ResetTokenTaken, so the transaction
 * rolls back, when the link was already used or the User no longer has a
 * password.
 */
export async function saveStaffReset(
  tx: Tx,
  r: { tokenId: string; userId: string; passwordHash: string; now: Date },
): Promise<void> {
  const consumed = await tx.passwordResetToken.updateMany({
    where: { id: r.tokenId, userId: r.userId, usedAt: null, expiresAt: { gt: r.now } },
    data: { usedAt: r.now },
  });
  if (consumed.count !== 1) throw new ResetTokenTaken();
  const changed = await tx.user.updateMany({
    where: { id: r.userId, passwordHash: { not: null } },
    data: { passwordHash: r.passwordHash, passwordChangedAt: r.now },
  });
  if (changed.count !== 1) throw new ResetTokenTaken();
  // After the User row is written: that write holds the row every Allow, code swap and refresh for this partner
  // waits on, so none of them can slip a connection past the reset.
  await endConnectionsForPasswordReset(tx, r.userId, r.now);
  await tx.passwordResetToken.updateMany({ where: { userId: r.userId, usedAt: null }, data: { usedAt: r.now } });
  await logSecurityEvent(tx, { kind: "PASSWORD_RESET", userId: r.userId, data: { by: "email-link" } });
}

/**
 * Send the reset email and mark the request's event `sent: true` when it
 * went. Returns whether it went. Runs after the response (reset.ts), so the
 * request answers the same way whether or not this happens.
 */
export async function deliverResetEmail(
  db: Pick<PrismaClient, "securityEvent">,
  send: (msg: EmailMessage) => Promise<SendResult>,
  r: { eventId: string; data: ResetRequestData; msg: EmailMessage },
): Promise<boolean> {
  const res = await send(r.msg);
  if (!res.ok) return false;
  await db.securityEvent.updateMany({ where: { id: r.eventId }, data: { data: { ...r.data, sent: true } } });
  return true;
}
