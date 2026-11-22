import type { Prisma, PortalAccount, SecurityEventKind, User } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import type { prisma } from "@/lib/db";

/**
 * The parts of src/lib/portal/accounts.ts that take a transaction and touch
 * no request, so a test can run them on an in-memory one (accounts.ts is
 * `server-only`). accounts.ts re-exports everything here, so callers keep
 * importing from it.
 */

export type Db = Prisma.TransactionClient | typeof prisma;
export type Staff = Pick<User, "id">;

/**
 * A refusal staff should see as-is ("That contractor no longer exists."). It belongs to no field, so a sheet shows it
 * on its own error line. A refusal about the address is a FieldError on `email` instead, which marks the Email field.
 */
export class PortalAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccountError";
  }
}

/**
 * The line staff get when a login is made, or given back, for an archived
 * contractor. Archive refuses while there is an active login, so an archived
 * contractor can't sign in; a new or restored login would undo that for
 * someone nobody can find in the directory, search or pickers. Restoring
 * the contractor is the next step.
 */
export const ARCHIVED_CONTRACTOR_LINE = "Restore this contractor first.";

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

/**
 * Outstanding emailed links die whenever the password or the email changes or access is removed: reset links, and
 * Welcome back's sign-in links (sign-in-link-core.ts), which start a session just as a password would.
 */
export async function expireResetTokens(db: Db, accountId: string, at: Date = new Date()): Promise<void> {
  await db.passwordResetToken.updateMany({ where: { accountId, usedAt: null }, data: { usedAt: at } });
  await expireSignInLinks(db, accountId, at);
}

/** Unused sign-in links die: with the reset links above, and on Sign out everywhere, which keeps those. */
export async function expireSignInLinks(db: Db, accountId: string, at: Date = new Date()): Promise<void> {
  await db.portalSignInLink.updateMany({ where: { accountId, usedAt: null }, data: { usedAt: at } });
}

/**
 * What createPortalAccount hands back. Never the whole row: a staff action
 * returning it would serialize passwordHash into the response.
 */
export const CREATED_ACCOUNT_SELECT = {
  id: true,
  contactId: true,
  email: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
} as const satisfies Prisma.PortalAccountSelect;

export type CreatedPortalAccount = Pick<PortalAccount, keyof typeof CREATED_ACCOUNT_SELECT>;

/**
 * The checks and writes of createPortalAccount, inside the caller's
 * transaction (see accounts.ts for what it promises). `email` is already
 * normalized and shaped like an email; `passwordHash` hashes the starting
 * password. The contractor is read in this transaction, and an archived one
 * is refused (ARCHIVED_CONTRACTOR_LINE).
 *
 * Their row is locked first, so an Archive at the same moment (archive.ts
 * setContactArchived, FOR UPDATE) runs wholly before or after this: before,
 * and the read below sees it archived; after, and Archive sees the login.
 * FOR NO KEY UPDATE rather than FOR SHARE, because this can go on to write
 * the same row (the empty email): two creates for one contractor each
 * holding a share lock would deadlock on that write, where this way the
 * second waits and finds the first one's login. No lock is taken before it.
 */
export async function createPortalAccountIn(
  tx: Prisma.TransactionClient,
  contactId: string,
  email: string,
  passwordHash: string,
  createdByUser: Staff | null,
  // A login from an invite or the sign-up link carries the password the contractor chose (contractor-onboarding.md):
  // no first-password page, and the audit row names how it was made instead of a partner.
  opts: { chosenPassword?: boolean; via?: "invite" | "link" } = {},
): Promise<CreatedPortalAccount> {
  await tx.$executeRaw`SELECT 1 FROM "Contact" WHERE "id" = ${contactId} FOR NO KEY UPDATE`;
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, archivedAt: true, portalAccount: { select: { id: true } } },
  });
  if (!contact) throw new PortalAccountError("That contractor no longer exists.");
  if (contact.archivedAt) throw new PortalAccountError(ARCHIVED_CONTRACTOR_LINE);
  if (contact.portalAccount) throw new PortalAccountError("This contractor already has a login.");
  // /login checks User first, so an address can't be both kinds of account.
  const staff = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (staff) throw new FieldError({ email: "That email belongs to a staff login." });
  const taken = await tx.portalAccount.findUnique({ where: { email }, select: { id: true } });
  if (taken) throw new FieldError({ email: "Another contractor already uses that email." });

  const created = await tx.portalAccount.create({
    data: { contactId, email, passwordHash, mustChangePassword: !opts.chosenPassword, createdByUserId: createdByUser?.id ?? null },
    select: CREATED_ACCOUNT_SELECT,
  });
  await logSecurityEvent(tx, {
    kind: "ACCOUNT_CREATED",
    userId: createdByUser?.id ?? null,
    contactId,
    ...(opts.via ? { data: { via: opts.via } } : {}),
  });
  // A contact with no email gets the login's, so staff can reach them without a second step.
  // Written only while the email is still the empty one read above, so a save that lands in between is kept.
  if (!contact.email?.trim()) await tx.contact.updateMany({ where: { id: contactId, email: contact.email }, data: { email } });
  return created;
}

/**
 * The checks and writes of enablePortalAccount, inside the caller's
 * transaction: access comes back, and the password and the revoked sessions
 * stay as they are. An archived contractor's login stays off
 * (ARCHIVED_CONTRACTOR_LINE).
 *
 * SecurityEventKind has no ACCOUNT_ENABLED yet, so this is logged as an
 * ACCOUNT_DISABLED row with `action: "enabled"`. Until the enum gains its
 * own value, read ACCOUNT_DISABLED as "access status changed" and go by
 * `data.action`; ACCOUNT_CREATED stays one row per login, so "created on"
 * views are right.
 *
 * The contractor's row is locked FOR SHARE first (found through the login,
 * in one statement), so an Archive at the same moment runs wholly before or
 * after: the read below then sees it archived, or Archive sees the active
 * login and refuses. Contact, then PortalAccount, as createPortalAccountIn.
 */
export async function enablePortalAccountIn(tx: Prisma.TransactionClient, accountId: string, byUser: Staff): Promise<void> {
  await tx.$executeRaw`
    SELECT 1 FROM "Contact" c JOIN "PortalAccount" a ON a."contactId" = c."id"
    WHERE a."id" = ${accountId} FOR SHARE OF c`;
  const account = await tx.portalAccount.findUnique({
    where: { id: accountId },
    select: { id: true, contactId: true, contact: { select: { archivedAt: true } } },
  });
  if (!account) throw new PortalAccountError("That login no longer exists.");
  if (account.contact.archivedAt) throw new PortalAccountError(ARCHIVED_CONTRACTOR_LINE);
  await tx.portalAccount.update({ where: { id: accountId }, data: { status: "ACTIVE" } });
  await logSecurityEvent(tx, {
    kind: "ACCOUNT_DISABLED",
    userId: byUser.id,
    contactId: account.contactId,
    data: { action: "enabled" },
  });
}

/**
 * The write of setPortalJobEmails, inside the caller's transaction: the
 * "Job emails" switch on the Portal access card
 * (docs/specs/contractor-email-switch.md). Answers whether anything changed.
 * A switch already where it was asked to go writes nothing and logs nothing,
 * so two partners turning it off at once leave one audit row.
 *
 * Logged like the login's other changes, as an ACCOUNT_DISABLED row with an
 * `action` (see changePortalEmail in accounts.ts on why that kind).
 */
export async function setJobEmailsIn(tx: Prisma.TransactionClient, accountId: string, on: boolean, byUser: Staff): Promise<boolean> {
  const account = await tx.portalAccount.findUnique({ where: { id: accountId }, select: { id: true, contactId: true } });
  if (!account) throw new PortalAccountError("That login no longer exists.");
  const { count } = await tx.portalAccount.updateMany({ where: { id: accountId, jobEmails: !on }, data: { jobEmails: on } });
  if (count === 0) return false;
  await logSecurityEvent(tx, {
    kind: "ACCOUNT_DISABLED",
    userId: byUser.id,
    contactId: account.contactId,
    data: { action: on ? "job-emails-on" : "job-emails-off" },
  });
  return true;
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
  if (staff) throw new FieldError({ email: "That email belongs to a staff login." });
  const taken = await tx.portalAccount.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== accountId) throw new FieldError({ email: "Another contractor already uses that email." });
  await tx.portalAccount.update({ where: { id: accountId }, data: { email } });
  await expireResetTokens(tx, accountId);
  await logSecurityEvent(tx, {
    kind: "ACCOUNT_DISABLED",
    userId: byUser.id,
    contactId: account.contactId,
    data: { action: "email-changed", from: account.email, to: email },
  });
}
