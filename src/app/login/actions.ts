"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS, isAllowedEmail, AUTH_CONFIGURED } from "@/lib/auth-allowlist";
import { SESSION_COOKIE, signSession, passwordMatches } from "@/lib/session";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

/** Password sign-in (production). */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = USERS.find((u) => u.email.toLowerCase() === email);
  if (!user || !passwordMatches(password, process.env[user.passwordEnv])) {
    redirect("/login?error=bad");
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(email), COOKIE_OPTS);
  redirect("/");
}

/** Dev sign-in (no passwords configured) — just pick a user. */
export async function devLogin(formData: FormData) {
  if (AUTH_CONFIGURED) return;
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (!isAllowedEmail(email)) return;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(email), COOKIE_OPTS);
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
