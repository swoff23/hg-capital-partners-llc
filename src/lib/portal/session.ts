import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { Principal } from "@/lib/tasks/core";
import { sessionExpiresAt, sessionIsLive, shouldTouchSession } from "./limits";
import { portalCookieForRequest, requestUserAgent } from "./request";
import { hashToken, isWellFormedToken, newToken } from "./tokens";

/**
 * Contractor sessions (docs/asana-migration-plan.md §5.1). The cookie holds a
 * random token; PortalSession stores its hash. Every request re-checks the
 * row, the account and the contact, so "Sign out everywhere" and "Remove
 * access" take effect on the next request.
 *
 * Staff auth (src/lib/auth.ts) never reads this cookie, and this module never
 * reads the staff one: a portal session can't satisfy a staff check, and the
 * other way round.
 */

export type PortalPrincipal = { contactId: string; accountId: string; sessionId: string; email: string; label: string };

/** Where a contractor still holding a starting password is sent. */
export const WELCOME_PASSWORD_PATH = "/p/welcome/password";

interface PortalSessionState {
  principal: PortalPrincipal;
  mustChangePassword: boolean;
}

const readSession = cache(async (): Promise<PortalSessionState | null> => {
  if (!getEnv().portalEnabled) return null;
  const { name } = await portalCookieForRequest();
  const token = (await cookies()).get(name)?.value;
  if (!isWellFormedToken(token)) return null;

  const now = new Date();
  const row = await prisma.portalSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      account: {
        select: {
          id: true,
          email: true,
          status: true,
          mustChangePassword: true,
          contact: { select: { id: true, fullName: true, active: true } },
        },
      },
    },
  });
  if (!row || !sessionIsLive(row, now)) return null;
  if (row.account.status !== "ACTIVE" || !row.account.contact.active) return null;

  if (shouldTouchSession(row.lastUsedAt, now)) {
    // Conditional on the value we read, so two tabs loading at once write once.
    await prisma.$transaction([
      prisma.portalSession.updateMany({ where: { id: row.id, lastUsedAt: row.lastUsedAt }, data: { lastUsedAt: now } }),
      prisma.portalAccount.update({ where: { id: row.account.id }, data: { lastSeenAt: now } }),
    ]);
  }

  return {
    principal: {
      contactId: row.account.contact.id,
      accountId: row.account.id,
      sessionId: row.id,
      email: row.account.email,
      label: row.account.contact.fullName,
    },
    mustChangePassword: row.account.mustChangePassword,
  };
});

/**
 * The signed-in contractor, or null (no cookie, revoked or expired session,
 * disabled account, inactive contact, or PORTAL_ENABLED off).
 *
 * Also null while the starting password is still in use, so the first-sign-in
 * rule that requirePortalPrincipal applies to pages holds for every API route
 * too (the file and upload routes, and anything later): a login on its
 * starting password can't read or upload anything. Only the code that must
 * act on that session anyway (sign-out, and the reset link keeping the
 * current session) passes `allowStartingPassword: true`.
 *
 * The session lookup underneath is React cache()d, so calling this more than
 * once in a request costs one query.
 */
export async function getPortalPrincipal(opts: { allowStartingPassword?: boolean } = {}): Promise<PortalPrincipal | null> {
  const state = await readSession();
  if (!state) return null;
  if (state.mustChangePassword && !opts.allowStartingPassword) return null;
  return state.principal;
}

/**
 * For every /p page and portal action:
 *  - 404 while PORTAL_ENABLED is off;
 *  - /login when signed out;
 *  - /p/welcome/password while the starting password is still in use.
 * The welcome page itself passes `{ passwordPage: true }`, which flips the
 * last rule: it sends anyone who has already chosen a password on to /p.
 */
export async function requirePortalPrincipal(opts: { passwordPage?: boolean } = {}): Promise<PortalPrincipal> {
  if (!getEnv().portalEnabled) notFound();
  const state = await readSession();
  if (!state) redirect("/login");
  if (opts.passwordPage) {
    if (!state.mustChangePassword) redirect("/p");
  } else if (state.mustChangePassword) {
    redirect(WELCOME_PASSWORD_PATH);
  }
  return state.principal;
}

/** Where a signed-in contractor belongs, for /login to bounce them on. Null when signed out. */
export async function portalHomePath(): Promise<string | null> {
  const state = await readSession();
  if (!state) return null;
  return state.mustChangePassword ? WELCOME_PASSWORD_PATH : "/p";
}

/** The contractor as the actor on a task write (src/lib/tasks/core.ts). */
export function taskPrincipal(p: PortalPrincipal): Principal {
  return { kind: "contractor", contactId: p.contactId, label: p.label };
}

/** After a successful sign-in: a new session row, and its cookie on the response. Server actions only. */
export async function startPortalSession(accountId: string): Promise<void> {
  const token = newToken();
  await prisma.portalSession.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      expiresAt: sessionExpiresAt(new Date()),
      userAgent: await requestUserAgent(),
    },
  });
  const { name, options } = await portalCookieForRequest();
  (await cookies()).set(name, token, options);
}

/** Sign out on this device: revoke the session (when there is one) and clear the cookie. Server actions only. */
export async function endPortalSession(principal: PortalPrincipal | null): Promise<void> {
  if (principal) {
    await prisma.portalSession.updateMany({
      where: { id: principal.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  // Set rather than delete: a __Host- cookie is only replaced by one with the
  // same Secure and Path attributes.
  const { name, options } = await portalCookieForRequest();
  (await cookies()).set(name, "", { ...options, maxAge: 0 });
}
