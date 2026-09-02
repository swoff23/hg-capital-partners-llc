"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { loginThrottle } from "@/lib/login-throttle";
import { verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "@/lib/session";

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: getEnv().isProduction,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
});

/** Email + password, checked against User.passwordHash in the DB. */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Per-email throttle (see src/lib/login-throttle.ts). Checked before the
  // scrypt work so a locked key costs nothing.
  if (email && loginThrottle.check(email).locked) {
    redirect("/login?error=locked");
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) {
    const nowLocked = email ? loginThrottle.recordFailure(email) : false;
    loginThrottle.prune();
    redirect(nowLocked ? "/login?error=locked" : "/login?error=bad");
  }

  loginThrottle.reset(email);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(email), cookieOpts());
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
