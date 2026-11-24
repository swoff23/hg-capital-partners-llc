import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { firstName } from "@/lib/portal/job-view";
import { signInLinkOwner } from "@/lib/portal/sign-in-link";
import { AuthFrame, AuthNotice, authButtonClass } from "../_components/auth-frame";
import { AuthSubmit } from "../_components/auth-submit";

// The token is in the URL, so the page never sends it on as a Referer. The HTTP headers (Referrer-Policy,
// Cache-Control: no-store) are set for this path in next.config.ts; the meta tag says the same in the document.
export const metadata: Metadata = {
  title: { absolute: `Sign In | ${BRAND.company}` },
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

/**
 * The link in a "Sign in to HG Capital" email (Welcome back's "Email me a
 * sign-in link", docs/specs/contractor-scheduled-date.md section 12). Opening
 * it spends nothing: work email scanners open every link in a message, so
 * the tap on Sign in is what uses it (as a reset link's form does). A link
 * that's used, past its 15 minutes, or for a login that can't sign in says
 * so, and sign in is the way forward.
 */
export default async function SignInLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Read first: a build without PORTAL_ENABLED would otherwise prerender this as a static 404 for good.
  const { token = "" } = (await searchParams) as { token?: string };
  if (!getEnv().portalEnabled) notFound();

  const owner = await signInLinkOwner(token);
  if (!owner) {
    return (
      <AuthFrame title="This link has expired">
        <AuthNotice>Sign-in links work once, for 15 minutes.</AuthNotice>
        <Link href="/login" className={cn(authButtonClass, "mt-4")}>
          Back to sign in
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={`Welcome back, ${firstName(owner.name)}`} subtitle="Sign in to see all your jobs.">
      {/* A plain POST to a route handler, not a server action: see submit/route.ts. */}
      <form method="post" action="/login/link/submit" className="mt-8">
        <input type="hidden" name="token" value={token} />
        <AuthSubmit native>Sign in</AuthSubmit>
      </form>
    </AuthFrame>
  );
}
