import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAFF_PATH_HEADER, staffReturnPath, withNext } from "@/lib/next-path";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const email = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  // No hash = not provisioned to sign in — also revokes any existing session
  // immediately if a password is ever cleared, not just at next login.
  if (!user?.passwordHash) return null;
  return user;
}

/**
 * The signed-in staff user, or /login when there isn't one. The redirect
 * keeps the page asked for as ?next= (src/lib/next-path.ts), so an email's
 * task link still opens that task after sign-in.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(withNext("/login", await requestedStaffPath()));
  return user;
}

/** The staff page this request is for (src/proxy.ts sets the header), or null for the dashboard or anything else. */
async function requestedStaffPath(): Promise<string | null> {
  return staffReturnPath((await headers()).get(STAFF_PATH_HEADER));
}
