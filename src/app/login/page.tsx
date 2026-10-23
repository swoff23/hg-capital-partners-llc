import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { portalReturnPath } from "@/lib/portal/next-path";
import { portalHomePath } from "@/lib/portal/session";
import { login } from "./actions";
import { AuthError, AuthFrame, AuthNotice, authButtonClass, authInputClass, authLinkClass } from "./_components/auth-frame";

export const metadata: Metadata = {
  title: "Sign In | HG Capital Partners",
  description: "Internal operations sign-in.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error, notice, next: rawNext } = (await searchParams) as { error?: string; notice?: string; next?: string };
  const portalEnabled = getEnv().portalEnabled;
  // The /p page a signed-out contractor was sent here from. Staff sign-in ignores it.
  const next = portalEnabled ? portalReturnPath(rawNext) : null;
  const portalHome = await portalHomePath(next);
  if (portalHome) redirect(portalHome);

  return (
    <AuthFrame>
      {error ? (
        <AuthError>
          {error === "locked" ? "Too many failed attempts. Try again in 15 minutes." : "Wrong email or password."}
        </AuthError>
      ) : (
        notice === "reset" && <AuthNotice>Password changed. Sign in with the new one.</AuthNotice>
      )}

      <form action={login} className="mt-8 space-y-3 text-left">
        {next && <input type="hidden" name="next" value={next} />}
        <input
          name="email"
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="username"
          required
          autoFocus
          className={authInputClass}
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          required
          className={authInputClass}
        />
        <button type="submit" className={authButtonClass}>
          Sign in
        </button>
      </form>

      {portalEnabled && (
        <p className="mt-3">
          <Link href="/login/forgot" className={authLinkClass}>
            Forgot password?
          </Link>
        </p>
      )}
    </AuthFrame>
  );
}
