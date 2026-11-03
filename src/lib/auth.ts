import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAFF_PATH_HEADER, staffReturnPath, withNext } from "@/lib/next-path";
import { SESSION_COOKIE, readSession } from "@/lib/session";

/** The signed-in partner as pages and actions see them: never the password hash. */
export type SessionUser = Pick<User, "id" | "email" | "name">;

/**
 * The signed-in staff user, or null. Read once per request (React cache): the
 * app layout and the page both ask, and they share one query.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const email = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!email) return null;
  // No hash = not provisioned to sign in: also revokes any existing session
  // immediately if a password is ever cleared, not just at next login.
  return prisma.user.findUnique({ where: { email, passwordHash: { not: null } }, select: { id: true, email: true, name: true } });
});

/**
 * The signed-in staff user, or /login when there isn't one. The redirect
 * keeps the page asked for as ?next= (src/lib/next-path.ts), so an email's
 * task link still opens that task after sign-in.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(withNext("/login", await requestedStaffPath()));
  return user;
}

/** The staff page this request is for (src/proxy.ts sets the header), or null for the dashboard or anything else. */
async function requestedStaffPath(): Promise<string | null> {
  return staffReturnPath((await headers()).get(STAFF_PATH_HEADER));
}
