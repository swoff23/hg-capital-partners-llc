import type { Metadata } from "next";
import { AuthError, AuthFrame, authInputClass, authLinkClass } from "@/app/login/_components/auth-frame";
import { AuthSubmit } from "@/app/login/_components/auth-submit";
import { MIN_PASSWORD_LENGTH, PASSWORD_MESSAGES, isPasswordProblem } from "@/lib/portal/credentials";
import { firstName as greetingName } from "@/lib/portal/job-view";
import { portalReturnPath } from "@/lib/portal/next-path";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { chooseOwnPassword, signOutPortal } from "../../actions";

export const metadata: Metadata = { title: "Choose Your Password" };

// Shown after the first sign-in, until the starting password is replaced.
// Every other /p page sends the contractor here while it's still in use,
// with the page they asked for as ?next=, which the form passes on.
export default async function WelcomePasswordPage({ searchParams }: PageProps<"/p/welcome/password">) {
  const principal = await requirePortalPrincipal({ passwordPage: true });
  const { error, next: rawNext } = (await searchParams) as { error?: string; next?: string };
  const next = portalReturnPath(rawNext);
  const firstName = greetingName(principal.label);
  const message = !isPasswordProblem(error)
    ? null
    : error === "wrong-current"
      ? "That starting password is wrong."
      : error === "same"
        ? "Pick a new password, not the starting one."
        : PASSWORD_MESSAGES[error];

  return (
    <AuthFrame title="Choose your own password" subtitle={`Hi ${firstName}. At least ${MIN_PASSWORD_LENGTH} characters.`}>
      {message && <AuthError>{message}</AuthError>}

      <form action={chooseOwnPassword} className="mt-8 space-y-3 text-left">
        {next && <input type="hidden" name="next" value={next} />}
        {/* Lets password managers file the new password under the right login. */}
        <input type="email" name="username" value={principal.email} autoComplete="username" readOnly hidden />
        <input
          name="current"
          type="password"
          placeholder="Starting password"
          aria-label="Starting password"
          autoComplete="current-password"
          required
          autoFocus
          className={authInputClass}
        />
        <input
          name="password"
          type="password"
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
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
        <AuthSubmit pendingLabel="Saving…">Save password</AuthSubmit>
      </form>

      <form action={signOutPortal} className="mt-3">
        <button type="submit" className={authLinkClass}>
          Sign out
        </button>
      </form>
    </AuthFrame>
  );
}
