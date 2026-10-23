"use server";
import { redirect } from "next/navigation";
import { changeOwnPassword } from "@/lib/portal/accounts";
import { checkNewPassword } from "@/lib/portal/credentials";
import { WELCOME_PASSWORD_PATH, endPortalSession, getPortalPrincipal, requirePortalPrincipal } from "@/lib/portal/session";

/** Sign out on this device. Clears the cookie even when the session is already dead. */
export async function signOutPortal() {
  // The welcome page has a Sign out button, so a session still on its
  // starting password must be revoked too.
  await endPortalSession(await getPortalPrincipal({ allowStartingPassword: true }));
  redirect("/login");
}

/** First sign-in: swap the starting password for one the contractor chose. */
export async function chooseOwnPassword(formData: FormData) {
  const principal = await requirePortalPrincipal({ passwordPage: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = checkNewPassword(next, { confirm });
  if (problem) redirect(`${WELCOME_PASSWORD_PATH}?error=${problem}`);

  const result = await changeOwnPassword(principal, current, next);
  if (!result.ok) redirect(`${WELCOME_PASSWORD_PATH}?error=${result.error}`);
  redirect("/p?saved=1");
}
