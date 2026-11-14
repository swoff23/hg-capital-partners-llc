import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { JobLinkKind, TaskStatus } from "@prisma/client";
import { LATE_UPLOAD_WINDOW_MS } from "@/lib/attachments/access";
import { isActiveStatus } from "@/lib/task-scope";
import type { Principal } from "@/lib/tasks/core";
import { sessionExpiresAt, sessionIsLive, shouldTouchSession } from "./limits";
import { linkSessionMayOpen } from "./job-link-paths";
import { PORTAL_HOME, SETUP_PATH, WELCOME_PASSWORD_PATH, afterPortalSignIn, isSetupPath, withNext } from "./next-path";
import { portalCookieForRequest, requestUserAgent, requestedPortalPath } from "./request";
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

export type PortalPrincipal = {
  contactId: string;
  accountId: string;
  sessionId: string;
  email: string;
  label: string;
  /**
   * Set on a session an email's job link started (docs/specs/contractor-job-emails.md, section 3): it opens this one
   * job and nothing else. requirePortalPrincipal keeps it on the job's pages, and every contractor access check
   * (core.ts assertContractorAccess) refuses any other job. Null for a session from signing in.
   */
  onlyTaskId: string | null;
};

interface PortalSessionState {
  principal: PortalPrincipal;
  mustChangePassword: boolean;
  /**
   * Came in by an invite or the sign-up link and hasn't finished setup (docs/specs/contractor-onboarding.md): every
   * /p page but the setup steps sends them there. Never true for a contractor staff added.
   */
  inSetup: boolean;
}

/**
 * PORTAL_ENABLED is read per request, like the rest of env.ts. Waiting for the request first keeps a build made
 * without the flag from prerendering a portal page as it found it (a static 404 for /p and the first-password page,
 * which would stay one after the flag is turned on, or after a rollback to that build).
 */
async function portalOnForRequest(): Promise<boolean> {
  await connection();
  return getEnv().portalEnabled;
}

const readSession = cache(async (): Promise<PortalSessionState | null> => {
  if (!(await portalOnForRequest())) return null;
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
      onlyTaskId: true,
      onlyTask: { select: { status: true, completedAt: true } },
      jobLinkId: true,
      jobLink: { select: { kind: true } },
      account: {
        select: {
          id: true,
          email: true,
          status: true,
          mustChangePassword: true,
          contact: { select: { id: true, fullName: true, active: true, signupSource: true, setupDoneAt: true } },
        },
      },
    },
  });
  if (!row || !sessionIsLive(row, now)) return null;
  if (row.onlyTaskId && !linkSessionStillOpens(row.onlyTask, row.jobLinkId ? (row.jobLink?.kind ?? null) : "EMAIL", now)) return null;
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
      onlyTaskId: row.onlyTaskId,
    },
    // A link session never meets the first-password page: the link, not a password, is how it got in, and it opens one
    // job only. Signing in in full still asks for a new password while the starting one is in use.
    mustChangePassword: row.account.mustChangePassword && !row.onlyTaskId,
    inSetup: row.account.contact.signupSource !== "STAFF" && !row.account.contact.setupDoneAt,
  };
});

/**
 * Whether a link session still opens its job (spec section 3). It ends with the job: gone or Canceled at once, Done
 * once the hour after the approval is up, since a Done job still takes the contractor's files for an hour after their
 * Mark done (attachments/access.ts LATE_UPLOAD_WINDOW_MS) and the uploads in flight need the session. Only a session a
 * button link started counts: one a REPLY or STAFF link started (a reply address opened the job while that was
 * possible, before Nov 14's fix) never does.
 */
function linkSessionStillOpens(
  task: { status: TaskStatus; completedAt: Date | null } | null,
  linkKind: JobLinkKind | null,
  now: Date,
): boolean {
  if (linkKind !== "EMAIL" && linkKind !== "CREW") return false;
  if (!task || task.status === "CANCELED") return false;
  if (isActiveStatus(task.status)) return true;
  return task.status === "DONE" && !!task.completedAt && now.getTime() - task.completedAt.getTime() <= LATE_UPLOAD_WINDOW_MS;
}

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
 *
 * Each redirect keeps the page asked for (next-path.ts): as ?next= on /login
 * and the first-password page, and as the destination once the password is
 * chosen. So an email's job link still opens that job after sign-in.
 */
export async function requirePortalPrincipal(opts: { passwordPage?: boolean } = {}): Promise<PortalPrincipal> {
  if (!(await portalOnForRequest())) notFound();
  const state = await readSession();
  if (!state) redirect(withNext("/login", await requestedPortalPath()));
  if (state.principal.onlyTaskId) {
    // A link session stays on its job (job-link-paths.ts linkSessionMayOpen); anywhere else, they sign in in full.
    // Someone still in setup signs in and finishes it first, job or no job.
    const path = await requestedPortalPath();
    if (state.inSetup) redirect(withNext("/login", SETUP_PATH));
    if (opts.passwordPage || !linkSessionMayOpen(path, state.principal.onlyTaskId)) redirect(withNext("/login", path));
    return state.principal;
  }
  if (opts.passwordPage) {
    if (!state.mustChangePassword) redirect((await requestedPortalPath()) ?? PORTAL_HOME);
  } else if (state.mustChangePassword) {
    redirect(withNext(WELCOME_PASSWORD_PATH, await requestedPortalPath()));
  } else if (state.inSetup && !isSetupPath(await requestedPortalPath())) {
    // Setup is required (Connor, Nov 14): until details, trades and a W-9 are in, the steps are the only page.
    redirect(SETUP_PATH);
  }
  return state.principal;
}

/**
 * The portal layout's gate, which answers before anything streams: a 404
 * while PORTAL_ENABLED is off and /login when signed out, as real responses
 * (a page's own check runs inside its loading.tsx boundary, after a 200 and
 * a skeleton are already out). A login still on its starting password
 * passes: each page sends it to the first-password page (or, there, lets it
 * stay) through requirePortalPrincipal, which stays every page's and
 * action's real check, since a layout isn't re-run on client navigation.
 */
export async function requirePortalSession(): Promise<PortalPrincipal> {
  if (!(await portalOnForRequest())) notFound();
  const state = await readSession();
  if (!state) redirect(withNext("/login", await requestedPortalPath()));
  // A link session off its job goes to sign in here too, as a real redirect rather than one streamed after a 200.
  if (state.principal.onlyTaskId) {
    const path = await requestedPortalPath();
    if (state.inSetup) redirect(withNext("/login", SETUP_PATH));
    if (!linkSessionMayOpen(path, state.principal.onlyTaskId)) redirect(withNext("/login", path));
  }
  // Mid-setup, anything but the steps goes to them here too, as a real redirect. A starting password still comes first:
  // the steps' own requirePortalPrincipal sends it on to the first-password page with ?next=/p/setup, which this
  // reads as the steps (portalReturnPath), so it isn't sent back.
  if (state.inSetup && !isSetupPath(await requestedPortalPath())) redirect(SETUP_PATH);
  return state.principal;
}

/**
 * Where a signed-in contractor belongs, for /login to bounce them on: `next`
 * (already checked with portalReturnPath) or My jobs, by way of the
 * first-password page if need be. Null when signed out.
 */
export async function portalHomePath(next: string | null = null): Promise<string | null> {
  const state = await readSession();
  // A link session isn't signed in to My jobs: /login shows the form, and signing in replaces it with a full session.
  if (!state || state.principal.onlyTaskId) return null;
  if (state.inSetup && !state.mustChangePassword) return SETUP_PATH;
  return afterPortalSignIn(state.mustChangePassword, next);
}

/** The contractor as the actor on a task write (src/lib/tasks/core.ts). */
export function taskPrincipal(p: PortalPrincipal): Extract<Principal, { kind: "contractor" }> {
  return { kind: "contractor", contactId: p.contactId, label: p.label, onlyTaskId: p.onlyTaskId };
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

/**
 * A job link's session (job-links.ts): the same cookie as signing in, on a session row that opens one job. Its expiry
 * is a full session's; the job closing, the contractor losing it, Remove access and Sign out everywhere end it
 * sooner. Route handlers and server actions only.
 */
export async function startJobLinkSession(accountId: string, taskId: string, jobLinkId: string): Promise<void> {
  const token = newToken();
  await prisma.portalSession.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      expiresAt: sessionExpiresAt(new Date()),
      userAgent: await requestUserAgent(),
      onlyTaskId: taskId,
      jobLinkId,
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
