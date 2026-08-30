"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_COOKIE } from "@/lib/auth";
import { isAllowedEmail, SUPABASE_CONFIGURED } from "@/lib/auth-allowlist";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function devLogin(formData: FormData) {
  if (SUPABASE_CONFIGURED) return;
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (!isAllowedEmail(email)) return;
  const jar = await cookies();
  jar.set(DEV_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(DEV_COOKIE);
  if (SUPABASE_CONFIGURED) {
    const supabase = await getSupabaseServer();
    await supabase?.auth.signOut();
  }
  redirect("/login");
}
