import type { Prisma, SecurityEventKind, User } from "@prisma/client";
import type { prisma } from "@/lib/db";

/**
 * The parts of src/lib/portal/accounts.ts that take a transaction and touch
 * no request, so a test can run them on an in-memory one (accounts.ts is
 * `server-only`). accounts.ts re-exports everything here, so callers keep
 * importing from it.
 */

export type Db = Prisma.TransactionClient | typeof prisma;
export type Staff = Pick<User, "id">;

/** A refusal staff should see as-is ("That email belongs to a staff login."). */
export class PortalAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccountError";
  }
}

export interface SecurityEventInput {
  kind: SecurityEventKind;
  userId?: string | null;
  contactId?: string | null;
  taskId?: string | null;
  ipHash?: string | null;
  data?: Prisma.InputJsonObject;
}

export function logSecurityEvent(db: Db, e: SecurityEventInput) {
  return db.securityEvent.create({
    data: {
      kind: e.kind,
      userId: e.userId ?? null,
      contactId: e.contactId ?? null,
      taskId: e.taskId ?? null,
      ipHash: e.ipHash ?? null,
      data: e.data ?? {},
    },
  });
}

/** Revoke the account's live sessions, optionally keeping the one in use. Returns how many. */
export async function revokePortalSessions(db: Db, accountId: string, opts: { except?: string; at?: Date } = {}): Promise<number> {
  const { count } = await db.portalSession.updateMany({
    where: { accountId, revokedAt: null, ...(opts.except ? { NOT: { id: opts.except } } : {}) },
    data: { revokedAt: opts.at ?? new Date() },
  });
  return count;
}

/** Outstanding reset links die whenever the password changes or access is removed. */
export async function expireResetTokens(db: Db, accountId: string, at: Date = new Date()): Promise<void> {
  await db.passwordResetToken.updateMany({ where: { accountId, usedAt: null }, data: { usedAt: at } });
}

/**
 * The checks and writes of changePortalEmail, inside the caller's
 * transaction (see accounts.ts for what it promises). `email` is already
 * normalized and shaped like an email.
 *
 * The login's address is what a reset link was mailed to, so a link sent to
 * the old address dies with the change: otherwise whoever still reads that
 * inbox could set a new password for up to 30 minutes after staff moved the
 * login.
 */
export async function changePortalEmailIn(tx: Prisma.TransactionClient, accountId: string, email: string, byUser: Staff): Promise<void> {
  const account = await tx.portalAccount.findUnique({ where: { id: accountId }, select: { id: true, contactId: true, email: true } });
  if (!account) throw new PortalAccountError("That login no longer exists.");
  if (account.email === email) return;
  const staff = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (staff) throw new PortalAccountError("That email belongs to a staff login.");
  const taken = await tx.portalAccount.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== accountId) throw new PortalAccountError("Another contractor already uses that email.");
  await tx.portalAccount.update({ where: { id: accountId }, data: { email } });
  await expireResetTokens(tx, accountId);
  await logSecurityEvent(tx, {
    kind: "ACCOUNT_DISABLED",
    userId: byUser.id,
    contactId: account.contactId,
    data: { action: "email-changed", from: account.email, to: email },
  });
}
