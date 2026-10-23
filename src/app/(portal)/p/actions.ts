"use server";
import { redirect } from "next/navigation";
import { changeOwnPassword } from "@/lib/portal/accounts";
import { checkNewPassword } from "@/lib/portal/credentials";
import { WELCOME_PASSWORD_PATH, portalReturnPath, withNext } from "@/lib/portal/next-path";
import { endPortalSession, getPortalPrincipal, requirePortalPrincipal } from "@/lib/portal/session";

/** Sign out on this device. Clears the cookie even when the session is already dead. */
export async function signOutPortal() {
  // The welcome page has a Sign out button, so a session still on its
  // starting password must be revoked too.
  await endPortalSession(await getPortalPrincipal({ allowStartingPassword: true }));
  redirect("/login");
}

/**
 * First sign-in: swap the starting password for one the contractor chose,
 * then go on to the page they signed in for (the form's hidden `next`, see
 * src/lib/portal/next-path.ts), or My jobs with its "Password saved" line.
 */
export async function chooseOwnPassword(formData: FormData) {
  const principal = await requirePortalPrincipal({ passwordPage: true });
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = portalReturnPath(formData.get("next"));

  const problem = checkNewPassword(password, { confirm });
  if (problem) redirect(withNext(`${WELCOME_PASSWORD_PATH}?error=${problem}`, back));

  const result = await changeOwnPassword(principal, current, password);
  if (!result.ok) redirect(withNext(`${WELCOME_PASSWORD_PATH}?error=${result.error}`, back));
  redirect(back ?? "/p?saved=1");
}
