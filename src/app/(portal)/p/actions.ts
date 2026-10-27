"use server";
import { redirect } from "next/navigation";
import { changeOwnPassword } from "@/lib/portal/accounts";
import { checkNewPassword, isStartingPasswordTry, type PasswordProblem } from "@/lib/portal/credentials";
import { portalReturnPath } from "@/lib/portal/next-path";
import { endPortalSession, getPortalPrincipal, requirePortalPrincipal } from "@/lib/portal/session";

/** Sign out on this device. Clears the cookie even when the session is already dead. */
export async function signOutPortal() {
  // The welcome page has a Sign out button, so a session still on its
  // starting password must be revoked too.
  await endPortalSession(await getPortalPrincipal({ allowStartingPassword: true }));
  redirect("/login");
}

/**
 * What a refused first password hands back to the form (`useActionState` in
 * welcome/password/welcome-form.tsx): which problem, as a code the form puts
 * on the right field. Nothing typed comes back: the form keeps its own text.
 */
export interface FirstPasswordState {
  error: PasswordProblem | null;
  /**
   * The starting password was posted empty (the form sent without script): its
   * own line, "Enter your starting password.", on that field. It is the form
   * unfilled, not a guess, so it never reaches the sign-in throttle.
   */
  missing?: boolean;
}

/**
 * First sign-in: swap the starting password for one the contractor chose,
 * then go on to the page they signed in for (the form's hidden `next`, see
 * src/lib/portal/next-path.ts), or My jobs with its "Password saved" line.
 *
 * A refusal comes back as state (forms 4.9), not a redirect, so both fields
 * stay as typed and the reason shows on the field it's about. There is one
 * new-password field with Show, so there is no second copy to match.
 */
export async function chooseOwnPassword(_prev: FirstPasswordState, formData: FormData): Promise<FirstPasswordState> {
  const principal = await requirePortalPrincipal({ passwordPage: true });
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const back = portalReturnPath(formData.get("next"));

  const problem = checkNewPassword(password);
  if (problem) return { error: problem };
  // An empty starting password is no try: it gets its own line here, before the throttle can count a strike.
  if (!isStartingPasswordTry(current)) return { error: "wrong-current", missing: true };

  const result = await changeOwnPassword(principal, current, password);
  if (!result.ok) return { error: result.error };
  redirect(back ?? "/p?saved=1");
}
