import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAllowedEmail, SUPABASE_CONFIGURED } from "@/lib/auth-allowlist";

export const DEV_COOKIE = "hgos_dev_user";

/** The signed-in user's email, from Supabase when configured, else the dev cookie. */
async function sessionEmail(): Promise<string | null> {
  if (SUPABASE_CONFIGURED) {
    const supabase = await getSupabaseServer();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    return data.user?.email?.toLowerCase() ?? null;
  }
  // Local development without Supabase — pick a user on /login.
  const jar = await cookies();
  return jar.get(DEV_COOKIE)?.value?.toLowerCase() ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const email = await sessionEmail();
  if (!isAllowedEmail(email)) return null;
  return prisma.user.findUnique({ where: { email: email! } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export const authMode = SUPABASE_CONFIGURED ? "supabase" : "dev";
