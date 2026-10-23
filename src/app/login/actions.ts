"use server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { loginThrottle } from "@/lib/login-throttle";
import { verifyPassword } from "@/lib/password";
import { authenticatePortalAccount } from "@/lib/portal/accounts";
import { afterPortalSignIn, portalReturnPath, withNext } from "@/lib/portal/next-path";
import { requestIpHash } from "@/lib/portal/request";
import { startPasswordReset } from "@/lib/portal/reset";
import { startPortalSession } from "@/lib/portal/session";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "@/lib/session";

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: getEnv().isProduction,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
});

/**
 * One sign-in for both kinds of account (docs/asana-migration-plan.md §5.1):
 * a User email signs in as staff exactly as before; otherwise, with the
 * portal on, the email is tried as a contractor login. Either way one scrypt
 * runs and a failure shows the same line, so the page doesn't reveal which
 * kind of account an email has, or whether it has one.
 *
 * The form's hidden `next` (the /p page a signed-out contractor was sent here
 * from, src/lib/portal/next-path.ts) only ever steers a contractor. Staff
 * always land on the dashboard, as before.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getEnv().portalEnabled ? portalReturnPath(formData.get("next")) : null;

  // Per-email throttle (see src/lib/login-throttle.ts), shared by staff and
  // contractor logins. Checked before the scrypt work so a locked key costs
  // nothing.
  if (email && loginThrottle.check(email).locked) {
    redirect(withNext("/login?error=locked", next));
  }

  function fail(): never {
    const nowLocked = email ? loginThrottle.recordFailure(email) : false;
    loginThrottle.prune();
    redirect(withNext(nowLocked ? "/login?error=locked" : "/login?error=bad", next));
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user || !getEnv().portalEnabled) {
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) fail();

    loginThrottle.reset(email);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, signSession(email), cookieOpts());
    redirect("/");
  }

  const result = await authenticatePortalAccount(email, password, await requestIpHash());
  if (!result.ok) fail();

  loginThrottle.reset(email);
  await startPortalSession(result.accountId);
  redirect(afterPortalSignIn(result.mustChangePassword, next));
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/**
 * "Forgot password": the same answer whether or not the email has a login.
 * (The reset link's own form posts to app/login/reset/submit/route.ts, not to
 * an action: see the note there.)
 */
export async function requestPasswordReset(formData: FormData) {
  if (!getEnv().portalEnabled) notFound();
  await startPasswordReset(String(formData.get("email") ?? ""), await requestIpHash());
  redirect("/login/forgot?sent=1");
}
