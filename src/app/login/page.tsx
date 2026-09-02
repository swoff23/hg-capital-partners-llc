import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { login } from "./actions";

export const metadata: Metadata = {
  title: "Sign In — HG Capital Partners",
  description: "Internal operations sign-in.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = (await searchParams) as { error?: string };

  return (
    <div className="flex min-h-screen flex-col bg-[#080b12] text-[#f2f4f7]">
      <PublicHeader />

      <main className="relative isolate flex flex-1 items-center justify-center px-6 py-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(150,165,195,0.08),transparent_70%)]" />

        <div className="w-full max-w-xs text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">HG Login</p>
          <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />

          {error && (
            <p className="mt-6 rounded-lg border border-[#e0796a]/25 bg-[#e0796a]/[0.08] px-3 py-2 text-xs text-[#e5a99b]">
              {error === "locked"
                ? "Too many failed attempts. Try again in 15 minutes."
                : "Wrong email or password."}
            </p>
          )}

          <form action={login} className="mt-8 space-y-3 text-left">
            <input
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="username"
              required
              autoFocus
              className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 text-sm text-[#e8eaee] placeholder:text-[#4c525c] focus:border-[#c8a765]/60 focus:outline-none"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 text-sm text-[#e8eaee] placeholder:text-[#4c525c] focus:border-[#c8a765]/60 focus:outline-none"
            />
            <button
              type="submit"
              className="mt-1 h-10 w-full rounded-full bg-[#e8eaee] text-[0.8125rem] font-medium tracking-wide text-[#08090b] transition-colors duration-200 hover:bg-[#c8a765]"
            >
              Sign in
            </button>
          </form>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
