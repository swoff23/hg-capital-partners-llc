import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { requestPasswordReset } from "../actions";
import { AuthFrame, AuthNotice, authInputClass, authLinkClass } from "../_components/auth-frame";
import { AuthSubmit } from "../_components/auth-submit";

export const metadata: Metadata = {
  title: "Forgot Password | HG Capital Partners",
  robots: { index: false, follow: false },
};

// Contractor logins only (docs/asana-migration-plan.md, defaults 2): a staff
// email gets the same "sent" answer, and nothing is emailed.
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/login/forgot">) {
  if (!getEnv().portalEnabled) notFound();
  const { sent } = (await searchParams) as { sent?: string };

  return (
    <AuthFrame
      title={sent ? "Check your email" : "Forgot your password?"}
      subtitle={sent ? undefined : "We'll email you a link to choose a new one."}
    >
      {sent ? (
        <AuthNotice>If that email has a login, a link is on its way.</AuthNotice>
      ) : (
        <form action={requestPasswordReset} className="mt-8 space-y-3 text-left">
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
          <AuthSubmit pendingLabel="Sending…">Email me a link</AuthSubmit>
        </form>
      )}

      <p className="mt-3">
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
