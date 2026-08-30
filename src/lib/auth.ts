import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAllowedEmail } from "@/lib/auth-allowlist";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const email = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!isAllowedEmail(email)) return null;
  return prisma.user.findUnique({ where: { email: email! } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
