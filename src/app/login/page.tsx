import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { afterStaffSignIn, staffReturnPath } from "@/lib/next-path";
import { portalReturnPath } from "@/lib/portal/next-path";
import { firstName } from "@/lib/portal/job-view";
import { portalHomePath, portalLinkSessionOwner } from "@/lib/portal/session";
import { requestSignInLink, signInAsSomeoneElse } from "./actions";
import { AuthFrame, AuthNotice, authLinkClass } from "./_components/auth-frame";
import { AuthSubmit } from "./_components/auth-submit";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: { absolute: `Sign In | ${BRAND.company}` },
  description: "Internal operations sign-in.",
};

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { notice, next: rawNext } = (await searchParams) as { notice?: string; next?: string };
  // The page a signed-out visitor was sent here from: a staff page
  // (src/lib/next-path.ts) or a /p page (src/lib/portal/next-path.ts). The
  // two never overlap, and each kind of account only follows its own.
  const staffNext = staffReturnPath(rawNext);
  if (await getCurrentUser()) redirect(afterStaffSignIn(staffNext));
  const portalEnabled = getEnv().portalEnabled;
  const portalNext = portalEnabled ? portalReturnPath(rawNext) : null;
  const portalHome = await portalHomePath(portalNext);
  if (portalHome) redirect(portalHome);

  // A contractor who opened a job from their job email and tapped back (docs/specs/contractor-scheduled-date.md
  // section 12, Connor's option A): Welcome back, with their email known and a sign-in link to their own inbox.
  // Never when a staff page sent them here: whoever asked for it is a partner, so the plain form shows.
  const linked = portalEnabled && !staffNext ? await portalLinkSessionOwner() : null;
  if (linked) {
    // Mid-setup, the job opens only once they've signed in and finished, so there's no way back to it yet.
    const back = linked.inSetup ? undefined : (
      <Link href={`/p/jobs/${linked.taskId}`} className={authLinkClass}>
        <ChevronLeft className="-ml-1 mr-0.5 size-4" aria-hidden="true" />
        Back to the job
      </Link>
    );
    if (notice === "link-sent") {
      return (
        <AuthFrame title="Check your email" subtitle="The link works once, for 15 minutes." back={back}>
          {/* One line: the address keeps whole, breaking only where it must on a very long one. */}
          <AuthNotice>
            Sent to <span className="break-all">{linked.email}</span>
          </AuthNotice>
        </AuthFrame>
      );
    }
    return (
      <AuthFrame title={`Welcome back, ${firstName(linked.name)}`} subtitle="Sign in to see all your jobs." back={back}>
        <LoginForm
          next={portalNext}
          passwordChanged={notice === "reset"}
          known={{ name: linked.name, email: linked.email, switchForm: "other-email" }}
        />
        <form id="other-email" action={signInAsSomeoneElse}>
          {portalNext && <input type="hidden" name="next" value={portalNext} />}
        </form>
        <p className="mt-3">
          <Link href="/login/forgot" className={authLinkClass}>
            Forgot password?
          </Link>
        </p>
        <form action={requestSignInLink} className="mt-4 border-t border-border pt-6">
          <AuthSubmit secondary>Email me a sign-in link</AuthSubmit>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <LoginForm next={portalNext ?? staffNext} passwordChanged={notice === "reset"} />

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
