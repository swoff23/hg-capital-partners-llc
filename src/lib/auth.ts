import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
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

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
