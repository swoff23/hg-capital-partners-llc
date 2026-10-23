import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { PASSWORD_MESSAGES, isPasswordProblem, MIN_PASSWORD_LENGTH } from "@/lib/portal/credentials";
import { resetTokenIsUsable } from "@/lib/portal/reset";
import { AuthError, AuthFrame, authInputClass, authLinkClass } from "../_components/auth-frame";
import { AuthSubmit } from "../_components/auth-submit";

// The token is in the URL, so the page never sends it on as a Referer. The
// HTTP headers (Referrer-Policy, Cache-Control: no-store) are set for this
// path in next.config.ts; the meta tag says the same in the document.
export const metadata: Metadata = {
  title: "New Password | HG Capital Partners",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/login/reset">) {
  if (!getEnv().portalEnabled) notFound();
  const { token = "", error } = (await searchParams) as { token?: string; error?: string };

  if (!(await resetTokenIsUsable(token))) {
    return (
      <AuthFrame title="This link has expired">
        <AuthError>Reset links work once, for 30 minutes.</AuthError>
        <p className="mt-3">
          <Link href="/login/forgot" className={authLinkClass}>
            Get a new link
          </Link>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
      {isPasswordProblem(error) && <AuthError>{PASSWORD_MESSAGES[error]}</AuthError>}

      {/* A plain POST to a route handler, not a server action: see submit/route.ts. */}
      <form method="post" action="/login/reset/submit" className="mt-8 space-y-3 text-left">
        <input type="hidden" name="token" value={token} />
        <input
          name="password"
          type="password"
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoFocus
          className={authInputClass}
        />
        <input
          name="confirm"
          type="password"
          placeholder="New password again"
          aria-label="New password again"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className={authInputClass}
        />
        {/* native: a second tap would spend the single-use token again and land on "This link has expired". */}
        <AuthSubmit native pendingLabel="Saving…">
          Save password
        </AuthSubmit>
      </form>
    </AuthFrame>
  );
}
