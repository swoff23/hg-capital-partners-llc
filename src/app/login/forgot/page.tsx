import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { BRAND } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { AuthFrame, AuthNotice, authLinkClass } from "../_components/auth-frame";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: { absolute: `Forgot Password | ${BRAND.company}` },
  robots: { index: false, follow: false },
};

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

// Contractor logins only (docs/asana-migration-plan.md, defaults 2): a staff
// email gets the same "sent" answer, and nothing is emailed.
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/login/forgot">) {
  // Read first: a build without PORTAL_ENABLED would otherwise prerender this as a static 404 for good.
  const { sent } = (await searchParams) as { sent?: string };
  if (!getEnv().portalEnabled) notFound();

  return (
    <AuthFrame
      title={sent ? "Check your email" : "Forgot your password?"}
      subtitle={sent ? undefined : "We'll email you a link to choose a new one."}
    >
      {sent ? <AuthNotice>If that email has a login, a link is on its way.</AuthNotice> : <ForgotForm />}

      <p className="mt-3">
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
