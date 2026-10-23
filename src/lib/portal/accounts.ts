import "server-only";
import { after } from "next/server";
import { Prisma, type PortalAccount, type SecurityEventKind, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { loginThrottle } from "@/lib/login-throttle";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkNewPassword, looksLikeEmail, normalizeEmail, type PasswordProblem } from "./credentials";
import type { PortalPrincipal } from "./session";
import { generateStartingPassword } from "./tokens";

/**
 * Contractor logins (docs/asana-migration-plan.md §5.1, D4, D14). A
 * PortalAccount hangs off an existing Contact and is never a User row.
 *
 * Staff create the login and get a starting password back exactly once; the
 * contractor must replace it at first sign-in. Every change here writes a
 * SecurityEvent, and anything that changes who can get in revokes the
 * account's live sessions in the same transaction.
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Staff = Pick<User, "id">;

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

async function accountOrThrow(db: Db, accountId: string) {
  const account = await db.portalAccount.findUnique({ where: { id: accountId }, select: { id: true, contactId: true } });
  if (!account) throw new PortalAccountError("That login no longer exists.");
  return account;
}

// ---------------------------------------------------------------------------
// Staff side: the Portal access card on a contractor's page
// ---------------------------------------------------------------------------

/**
 * What createPortalAccount hands back. Never the whole row: a staff action
 * returning it would serialize passwordHash into the response.
 */
const CREATED_ACCOUNT_SELECT = {
  id: true,
  contactId: true,
  email: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
} as const satisfies Prisma.PortalAccountSelect;

export type CreatedPortalAccount = Pick<PortalAccount, keyof typeof CREATED_ACCOUNT_SELECT>;

/**
 * Create a login for a contractor. Returns the starting password, which is
 * not stored anywhere in the clear and can't be shown again.
 */
export async function createPortalAccount(
  contactId: string,
  rawEmail: string,
  createdByUser: Staff,
): Promise<{ account: CreatedPortalAccount; password: string }> {
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) throw new PortalAccountError("Enter a valid email.");

  const password = generateStartingPassword();
  const passwordHash = await hashPassword(password);

  try {
    const account = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({ where: { id: contactId }, select: { id: true, portalAccount: { select: { id: true } } } });
      if (!contact) throw new PortalAccountError("That contractor no longer exists.");
      if (contact.portalAccount) throw new PortalAccountError("This contractor already has a login.");
      // /login checks User first, so an address can't be both kinds of account.
      const staff = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      if (staff) throw new PortalAccountError("That email belongs to a staff login.");
      const taken = await tx.portalAccount.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw new PortalAccountError("Another contractor already uses that email.");

      const created = await tx.portalAccount.create({
        data: { contactId, email, passwordHash, mustChangePassword: true, createdByUserId: createdByUser.id },
        select: CREATED_ACCOUNT_SELECT,
      });
      await logSecurityEvent(tx, { kind: "ACCOUNT_CREATED", userId: createdByUser.id, contactId });
      return created;
    });
    return { account, password };
  } catch (err) {
    // Two staff creating at once: the unique index catches what the reads missed.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PortalAccountError("That email or contractor already has a login.");
    }
    throw err;
  }
}

/** A new starting password, shown once. Signs the contractor out everywhere. */
export async function resetPortalPassword(accountId: string, byUser: Staff): Promise<{ password: string }> {
  const password = generateStartingPassword();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const account = await accountOrThrow(tx, accountId);
    const now = new Date();
    await tx.portalAccount.update({
      where: { id: accountId },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: now },
    });
    const revoked = await revokePortalSessions(tx, accountId, { at: now });
    await expireResetTokens(tx, accountId, now);
    await logSecurityEvent(tx, {
      kind: "PASSWORD_RESET",
      userId: byUser.id,
      contactId: account.contactId,
      data: { by: "staff", sessionsRevoked: revoked },
    });
  });
  return { password };
}

/** Remove access: the login stays (and its history), but nothing gets in. */
export async function disablePortalAccount(accountId: string, byUser: Staff): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const account = await accountOrThrow(tx, accountId);
    const now = new Date();
    await tx.portalAccount.update({ where: { id: accountId }, data: { status: "DISABLED" } });
    const revoked = await revokePortalSessions(tx, accountId, { at: now });
    await expireResetTokens(tx, accountId, now);
    await logSecurityEvent(tx, {
      kind: "ACCOUNT_DISABLED",
      userId: byUser.id,
      contactId: account.contactId,
      data: { action: "disabled", sessionsRevoked: revoked },
    });
  });
}

/**
 * Give access back. The password is unchanged and every old session stays
 * revoked, so the contractor signs in again.
 *
 * SecurityEventKind has no ACCOUNT_ENABLED yet, so this is logged as an
 * ACCOUNT_DISABLED row with `action: "enabled"`. Until the enum gains its
 * own value, read ACCOUNT_DISABLED as "access status changed" and go by
 * `data.action`; ACCOUNT_CREATED stays one row per login, so "created on"
 * views are right.
 */
export async function enablePortalAccount(accountId: string, byUser: Staff): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const account = await accountOrThrow(tx, accountId);
    await tx.portalAccount.update({ where: { id: accountId }, data: { status: "ACTIVE" } });
    await logSecurityEvent(tx, {
      kind: "ACCOUNT_DISABLED",
      userId: byUser.id,
      contactId: account.contactId,
      data: { action: "enabled" },
    });
  });
}

/** Sign the contractor out on every device. Staff pass themselves as `byUser`. */
export async function signOutEverywhere(accountId: string, byUser?: Staff): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const account = await accountOrThrow(tx, accountId);
    const revoked = await revokePortalSessions(tx, accountId);
    await logSecurityEvent(tx, {
      kind: "SESSIONS_REVOKED",
      userId: byUser?.id ?? null,
      contactId: account.contactId,
      data: { count: revoked },
    });
    return revoked;
  });
}

// ---------------------------------------------------------------------------
// Contractor side: signing in and choosing a password
// ---------------------------------------------------------------------------

export type PortalSignIn = { ok: true; accountId: string; mustChangePassword: boolean } | { ok: false };

/**
 * Check an email and password against PortalAccount. Called by /login only
 * after no User matched. Runs scrypt whether or not the account exists, and
 * a failure on a real account writes its SecurityEvent after the response,
 * so timing doesn't reveal which emails have a login. Every attempt on a
 * real account is logged; unknown emails aren't (there's no one to attach
 * them to). Request scope only (it uses `after`).
 */
export async function authenticatePortalAccount(email: string, password: string, ipHash: string | null): Promise<PortalSignIn> {
  const account = email
    ? await prisma.portalAccount.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, status: true, mustChangePassword: true, contactId: true, contact: { select: { active: true } } },
      })
    : null;
  const passwordOk = await verifyPassword(password, account?.passwordHash);
  if (!account) return { ok: false };

  const reason = !passwordOk ? "password" : account.status !== "ACTIVE" ? "disabled" : !account.contact.active ? "contact-inactive" : null;
  if (reason) {
    // After the response: an awaited insert here would make a wrong password
    // on a real login answer a round trip slower than an unknown email.
    after(() =>
      logSecurityEvent(prisma, { kind: "SIGN_IN_FAILED", contactId: account.contactId, ipHash, data: { reason } }).catch((err) =>
        logError("portal:sign-in-log", err),
      ),
    );
    return { ok: false };
  }

  await prisma.$transaction([
    prisma.portalAccount.update({ where: { id: account.id }, data: { lastSignInAt: new Date() } }),
    logSecurityEvent(prisma, { kind: "SIGN_IN_OK", contactId: account.contactId, ipHash }),
  ]);
  return { ok: true, accountId: account.id, mustChangePassword: account.mustChangePassword };
}

/**
 * The contractor replaces their own password (first sign-in, or later).
 * Wrong current passwords count against the same per-email throttle as
 * /login. Other devices are signed out; this one stays signed in.
 */
export async function changeOwnPassword(
  principal: PortalPrincipal,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: PasswordProblem }> {
  if (loginThrottle.check(principal.email).locked) return { ok: false, error: "locked" };
  const problem = checkNewPassword(next, { current, email: principal.email });
  if (problem) return { ok: false, error: problem };

  const account = await prisma.portalAccount.findUnique({ where: { id: principal.accountId }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, account?.passwordHash))) {
    const locked = loginThrottle.recordFailure(principal.email);
    return { ok: false, error: locked ? "locked" : "wrong-current" };
  }

  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.portalAccount.update({
      where: { id: principal.accountId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
    });
    const revoked = await revokePortalSessions(tx, principal.accountId, { except: principal.sessionId, at: now });
    await expireResetTokens(tx, principal.accountId, now);
    await logSecurityEvent(tx, {
      kind: "PASSWORD_CHANGED",
      contactId: principal.contactId,
      data: { sessionsRevoked: revoked },
    });
  });
  loginThrottle.reset(principal.email);
  return { ok: true };
}
