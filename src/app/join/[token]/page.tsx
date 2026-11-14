import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { AuthFrame, authButtonClass } from "@/app/login/_components/auth-frame";
import { BRAND } from "@/lib/brand";
import { brandTokensDark } from "@/lib/brand-tokens";
import { getEnv } from "@/lib/env";
import { resolveJoin } from "@/lib/portal/invites";
import { cn } from "@/lib/utils";
import { JoinForm } from "./join-form";

// The token is in the URL, so the page never sends it on as a Referer, and no search engine keeps it.
export const metadata: Metadata = {
  title: { absolute: `Set Up Your Account | ${BRAND.company}` },
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

/**
 * A contractor's personal invite or the shared sign-up link (docs/specs/contractor-onboarding.md, section 3).
 * Outside the (portal) group on purpose: that layout needs a session, and this is where one starts. A used,
 * expired, replaced or unknown link says so and nothing more.
 */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  // Read first: a build without PORTAL_ENABLED would otherwise prerender this as a static 404 for good.
  await connection();
  if (!getEnv().portalEnabled) notFound();
  const { token } = await params;
  const view = await resolveJoin(token);

  if (view.kind === "used") {
    return (
      <AuthFrame title="This invite was already used">
        <Link href="/login" className={cn(authButtonClass, "mt-6")}>
          Sign in
        </Link>
      </AuthFrame>
    );
  }
  if (view.kind === "expired") {
    return (
      <AuthFrame title="This invite has expired" subtitle="Ask HG Capital for a new one.">
        {null}
      </AuthFrame>
    );
  }
  if (view.kind === "invite") {
    return (
      <AuthFrame title="Set up your account" subtitle={view.firstName ? `Hi ${view.firstName}. Set up your HG Capital contractor account.` : "Set up your HG Capital contractor account."}>
        <JoinForm token={token} kind="invite" email={view.email ?? ""} />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Set up your account" subtitle="Set up your HG Capital contractor account.">
      <JoinForm token={token} kind="signup" email="" />
    </AuthFrame>
  );
}
