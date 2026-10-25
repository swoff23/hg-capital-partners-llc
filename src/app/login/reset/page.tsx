import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { PASSWORD_MESSAGES, isPasswordProblem, MIN_PASSWORD_LENGTH } from "@/lib/portal/credentials";
import { resetTokenIsUsable } from "@/lib/portal/reset";
import { AuthError, AuthFrame, AuthLabel, authButtonClass, authLinkClass } from "../_components/auth-frame";
import { AuthSubmit } from "../_components/auth-submit";
import { PasswordField } from "../_components/password-field";

// The token is in the URL, so the page never sends it on as a Referer. The
// HTTP headers (Referrer-Policy, Cache-Control: no-store) are set for this
// path in next.config.ts; the meta tag says the same in the document.
export const metadata: Metadata = {
  title: { absolute: `New Password | ${BRAND.company}` },
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/login/reset">) {
  if (!getEnv().portalEnabled) notFound();
  const { token = "", error } = (await searchParams) as { token?: string; error?: string };

  if (!(await resetTokenIsUsable(token))) {
    return (
      <AuthFrame title="This link has expired">
        <AuthError>Reset links work once, for 30 minutes.</AuthError>
        {/* The one way forward is the frame's CTA; signing in is the quiet link under it, as on Forgot. */}
        <Link href="/login/forgot" className={cn(authButtonClass, "mt-4")}>
          Get a new link
        </Link>
        <p className="mt-3">
          <Link href="/login" className={authLinkClass}>
            Back to sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
      {isPasswordProblem(error) && <AuthError>{PASSWORD_MESSAGES[error]}</AuthError>}

      {/* A plain POST to a route handler, not a server action: see submit/route.ts. */}
      <form method="post" action="/login/reset/submit" className="mt-8 space-y-4 text-left">
        <input type="hidden" name="token" value={token} />
        <div>
          <AuthLabel htmlFor="reset-password">New password</AuthLabel>
          <PasswordField
            id="reset-password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoFocus
          />
        </div>
        <div>
          <AuthLabel htmlFor="reset-confirm">New password again</AuthLabel>
          <PasswordField
            id="reset-confirm"
            name="confirm"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>
        {/* native: a second tap would spend the single-use token again and land on "This link has expired". */}
        <AuthSubmit native pendingLabel="Saving…">
          Save password
        </AuthSubmit>
      </form>
    </AuthFrame>
  );
}
