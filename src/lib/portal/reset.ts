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
import type { PortalPrincipal } from "./session";
import { hashToken, isWellFormedToken, newToken } from "./tokens";

/**
 * "Forgot password" for contractor logins (docs/asana-migration-plan.md
 * §5.1). Staff passwords stay managed by hand, so a staff email gets the same
 * answer as an unknown one and nothing is sent.
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
  const token = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESET_LOCK_EMAIL}::int, hashtext(${keyed}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESET_LOCK_IP}::int, hashtext(${ipHash}))`;

    // Sequential: one connection, and each count must see rows committed by
    // whoever held the lock before us.
    const byEmail = await tx.securityEvent.count({
      where: { kind: "PASSWORD_RESET_REQUESTED", createdAt: { gte: since }, data: { path: ["emailHash"], equals: keyed } },
    });
    const byIp = await tx.securityEvent.count({ where: { kind: "PASSWORD_RESET_REQUESTED", createdAt: { gte: since }, ipHash } });
    if (!resetRequestAllowed({ email: byEmail, ip: byIp })) return null;

    const account = await tx.portalAccount.findUnique({
      where: { email },
      select: { id: true, contactId: true, status: true, contact: { select: { active: true } } },
    });
    const usable = !!account && account.status === "ACTIVE" && account.contact.active;
    const token = usable ? newToken() : null;

    if (account && token) {
      await tx.passwordResetToken.create({
        data: { accountId: account.id, tokenHash: hashToken(token), expiresAt: resetTokenExpiresAt(now) },
      });
    }
    await logSecurityEvent(tx, {
      kind: "PASSWORD_RESET_REQUESTED",
      contactId: account?.contactId ?? null,
      ipHash,
      data: { emailHash: keyed, sent: !!token },
    });
    return token;
  });

  if (token) after(() => sendResetEmail(email, token));
}

async function sendResetEmail(to: string, token: string): Promise<void> {
  try {
    const { text, html } = renderPlainEmail({
      line: "Here's your link to choose a new password for HG jobs.",
      buttonLabel: "Choose a new password",
      buttonUrl: `${getEnv().appUrl}${RESET_PATH}?token=${token}`,
      footnote: "The link works for 30 minutes. If you didn't ask for it, you can ignore this email.",
    });
    await sendEmail({ to, subject: "Reset your HG password", text, html });
  } catch (err) {
    logError("portal:reset-email", err);
  }
}

async function findUsableToken(token: string, now: Date) {
  if (!isWellFormedToken(token)) return null;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      account: { select: { id: true, email: true, contactId: true, status: true, contact: { select: { active: true } } } },
    },
  });
  if (!row || row.usedAt || row.expiresAt <= now) return null;
  if (row.account.status !== "ACTIVE" || !row.account.contact.active) return null;
  return row;
}

/** For the reset page's first render: does this link still work? Read-only. */
export async function resetTokenIsUsable(token: string): Promise<boolean> {
  return !!(await findUsableToken(token, new Date()));
}

export type ResetProblem = PasswordProblem | "expired";

class TokenAlreadyUsed extends Error {}

/**
 * Set a new password from a reset link. The link is checked before the
 * password so a typo doesn't burn it, then consumed atomically: only one of
 * two racing submissions gets count 1. All sessions are revoked, except the
 * one making the request when it belongs to the same account.
 */
export async function finishPasswordReset(
  token: string,
  next: string,
  confirm: string,
  current: PortalPrincipal | null,
): Promise<{ ok: true } | { ok: false; error: ResetProblem }> {
  const now = new Date();
  const row = await findUsableToken(token, now);
  if (!row) return { ok: false, error: "expired" };
  const problem = checkNewPassword(next, { confirm, email: row.account.email });
  if (problem) return { ok: false, error: problem };

  const passwordHash = await hashPassword(next);
  const keep = current?.accountId === row.account.id ? current.sessionId : undefined;
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new TokenAlreadyUsed();
      await tx.portalAccount.update({
        where: { id: row.account.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
      });
      await expireResetTokens(tx, row.account.id, now);
      const revoked = await revokePortalSessions(tx, row.account.id, { except: keep, at: now });
      await logSecurityEvent(tx, {
        kind: "PASSWORD_RESET",
        contactId: row.account.contactId,
        data: { by: "email-link", sessionsRevoked: revoked },
      });
    });
  } catch (err) {
    if (err instanceof TokenAlreadyUsed) return { ok: false, error: "expired" };
    throw err;
  }
  loginThrottle.reset(row.account.email);
  return { ok: true };
}
