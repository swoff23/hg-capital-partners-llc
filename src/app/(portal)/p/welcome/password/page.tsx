import type { Metadata, Viewport } from "next";
import { brandTokensDark } from "@/lib/brand-tokens";
import { AuthFrame, authLinkClass } from "@/app/login/_components/auth-frame";
import { firstName as greetingName } from "@/lib/portal/job-view";
import { portalReturnPath } from "@/lib/portal/next-path";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { signOutPortal } from "../../actions";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Choose Your Password" };

// The sign-in frame is the public site's dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

// Shown after the first sign-in, until the starting password is replaced.
// Every other /p page sends the contractor here while it's still in use,
// with the page they asked for as ?next=, which the form passes on.
export default async function WelcomePasswordPage({ searchParams }: PageProps<"/p/welcome/password">) {
  const principal = await requirePortalPrincipal({ passwordPage: true });
  const { next: rawNext } = (await searchParams) as { next?: string };
  const next = portalReturnPath(rawNext);
  const firstName = greetingName(principal.label);

  return (
    <AuthFrame title="Choose your own password" subtitle={`Hi ${firstName}. Pick the password you'll sign in with from now on.`}>
      <WelcomeForm email={principal.email} next={next} />

      <form action={signOutPortal} className="mt-3">
        <button type="submit" className={authLinkClass}>
          Sign out
        </button>
      </form>
    </AuthFrame>
  );
}
