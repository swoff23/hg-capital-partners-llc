import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { PASSWORD_MESSAGES, isPasswordProblem } from "@/lib/portal/credentials";
import { resetTokenIsUsable } from "@/lib/portal/reset";
import { AuthFrame, AuthNotice, authButtonClass, authLinkClass } from "../_components/auth-frame";
import { ResetForm } from "./reset-form";

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
  // Read first: a build without PORTAL_ENABLED would otherwise prerender this as a static 404 for good.
  const { token = "", error } = (await searchParams) as { token?: string; error?: string };
  if (!getEnv().portalEnabled) notFound();

  if (!(await resetTokenIsUsable(token))) {
    return (
      <AuthFrame title="This link has expired">
        <AuthNotice>Reset links work once, for 30 minutes.</AuthNotice>
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
    <AuthFrame title="Choose a new password">
      <ResetForm token={token} refusal={isPasswordProblem(error) ? PASSWORD_MESSAGES[error] : undefined} />
    </AuthFrame>
  );
}
