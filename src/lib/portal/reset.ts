import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { renderPlainEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { loginThrottle } from "@/lib/login-throttle";
import { hashPassword } from "@/lib/password";
import { expireResetTokens, logSecurityEvent, revokePortalSessions } from "./accounts";
import { checkNewPassword, looksLikeEmail, normalizeEmail, type PasswordProblem } from "./credentials";
import { resetRequestAllowed, resetTokenExpiresAt, resetWindowStart } from "./limits";
import { emailHash } from "./request";
import {
  RESET_TOKEN_SELECT,
  ResetTokenTaken,
  deliverResetEmail,
  findResetOwner,
  resetTokenOwner,
  saveStaffReset,
  usableReset,
  type ResetOwner,
  type ResetRequestData,
} from "./reset-core";
import type { PortalPrincipal } from "./session";
import { hashToken, isWellFormedToken, newToken } from "./tokens";

/**
 * "Forgot password" for contractor logins (docs/asana-migration-plan.md
 * §5.1) and, since Nov 16, staff logins (docs/specs/staff-password-reset.md).
 * A staff User with no password gets the same answer as an unknown email and
 * nothing is sent: clearing a staff password is how that login is turned off.
 *
 * The request looks identical from outside whether or not the email has a
 * login: same redirect, and the email goes out after the response. Limits
 * are counted from SecurityEvent rows, under advisory locks, so they hold
 * across serverless instances and concurrent submissions: 3 per email and
 * 10 per IP per hour.
 */

const RESET_PATH = "/login/reset";

/**
 * Advisory-lock namespaces (the first key of pg_advisory_xact_lock's
 * two-int form), one per limit, so an email key and an IP key never share a
 * lock. Locks are always taken email first, then IP, so two requests can't
 * wait on each other.
 */
const RESET_LOCK_EMAIL = 7301;
const RESET_LOCK_IP = 7302;

/** Handle a "Forgot password" submission. Always resolves the same way. */
export async function startPasswordReset(rawEmail: string, ipHash: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return;

  const now = new Date();
  const since = resetWindowStart(now);
  const keyed = emailHash(email);

  // Count and insert under per-email and per-IP locks held to commit, so a
  // burst of submissions for one email or IP is counted one at a time and the
  // limits hold (each allowed request can send an email: D30's daily cap).
  const request = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESET_LOCK_EMAIL}::int, hashtext(${keyed}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESET_LOCK_IP}::int, hashtext(${ipHash}))`;

    // Sequential: one connection, and each count must see rows committed by
    // whoever held the lock before us.
    const byEmail = await tx.securityEvent.count({
      where: { kind: "PASSWORD_RESET_REQUESTED", createdAt: { gte: since }, data: { path: ["emailHash"], equals: keyed } },
    });
    const byIp = await tx.securityEvent.count({ where: { kind: "PASSWORD_RESET_REQUESTED", createdAt: { gte: since }, ipHash } });
    if (!resetRequestAllowed({ email: byEmail, ip: byIp })) return null;

    const { owner, contactId, userId } = await findResetOwner(tx, email);
    const token = owner ? newToken() : null;

    if (owner && token) {
      await tx.passwordResetToken.create({
        data: { ...resetTokenOwner(owner), tokenHash: hashToken(token), expiresAt: resetTokenExpiresAt(now) },
      });
    }
    // Not sent yet, for every address: the send after the response marks it once the email went (reset-core.ts).
    const data: ResetRequestData = { emailHash: keyed, sent: false };
    const event = await logSecurityEvent(tx, {
      kind: "PASSWORD_RESET_REQUESTED",
      contactId,
      userId,
      ipHash,
      data,
    });
    return owner && token ? { token, eventId: event.id, data, kind: owner.kind } : null;
  });

  if (request) after(() => sendResetEmail(email, request));
}

/** The email's first line: a contractor's login is for their jobs, a partner's for the whole app. */
const RESET_LINE: Record<ResetOwner["kind"], string> = {
  contractor: "Here's your link to choose a new password for HG Capital jobs.",
  staff: "Here's your link to choose a new password for HG Capital.",
};

async function sendResetEmail(
  to: string,
  request: { token: string; eventId: string; data: ResetRequestData; kind: ResetOwner["kind"] },
): Promise<void> {
  try {
    const { text, html } = renderPlainEmail({
      line: RESET_LINE[request.kind],
      buttonLabel: "Choose a new password",
      buttonUrl: `${getEnv().appUrl}${RESET_PATH}?token=${request.token}`,
      footnote: "The link works for 30 minutes. If you didn't ask for it, you can ignore this email.",
    });
    // sendEmail logs a failure itself; the event stays `sent: false`.
    await deliverResetEmail(prisma, sendEmail, {
      eventId: request.eventId,
      data: request.data,
      msg: { to, subject: "Reset your HG Capital password", text, html },
    });
  } catch (err) {
    logError("portal:reset-email", err);
  }
}

async function findUsableToken(token: string, now: Date) {
  if (!isWellFormedToken(token)) return null;
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, select: RESET_TOKEN_SELECT });
  return usableReset(row, now);
}

/** For the reset page's first render: does this link still work? Read-only. */
export async function resetTokenIsUsable(token: string): Promise<boolean> {
  return !!(await findUsableToken(token, new Date()));
}

export type ResetProblem = PasswordProblem | "expired";

/**
 * Set a new password from a reset link. The link is checked before the
 * password so a typo doesn't burn it, then consumed atomically: only one of
 * two racing submissions gets count 1.
 *
 * A contractor's sessions are all revoked, except the one making the request
 * when it belongs to the same account. A partner's reset signs them out
 * everywhere, the browser they reset from included (saveStaffReset).
 */
export async function finishPasswordReset(
  token: string,
  next: string,
  confirm: string,
  current: PortalPrincipal | null,
): Promise<{ ok: true } | { ok: false; error: ResetProblem }> {
  const now = new Date();
  const reset = await findUsableToken(token, now);
  if (!reset) return { ok: false, error: "expired" };
  const problem = checkNewPassword(next, { confirm, email: reset.email });
  if (problem) return { ok: false, error: problem };

  const passwordHash = await hashPassword(next);
  try {
    if (reset.kind === "staff") {
      await prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: reset.tokenId, userId: reset.userId, passwordHash, now }));
    } else {
      const keep = current?.accountId === reset.accountId ? current.sessionId : undefined;
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: reset.tokenId, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new ResetTokenTaken();
        await tx.portalAccount.update({
          where: { id: reset.accountId },
          data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
        });
        await expireResetTokens(tx, reset.accountId, now);
        const revoked = await revokePortalSessions(tx, reset.accountId, { except: keep, at: now });
        await logSecurityEvent(tx, {
          kind: "PASSWORD_RESET",
          contactId: reset.contactId,
          data: { by: "email-link", sessionsRevoked: revoked },
        });
      });
    }
  } catch (err) {
    if (err instanceof ResetTokenTaken) return { ok: false, error: "expired" };
    throw err;
  }
  loginThrottle.reset(reset.email);
  return { ok: true };
}
