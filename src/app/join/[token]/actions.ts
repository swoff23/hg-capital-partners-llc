"use server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getEnv } from "@/lib/env";
import { InviteError, acceptInvite, markInviteOpened, resolveJoin, signUpWithLink, type JoinField } from "@/lib/portal/invites";
import { requestIpHash } from "@/lib/portal/request";

/**
 * What a refused sign-up hands back to the form (`useActionState` in join-form.tsx): the line, and the field it's
 * about ("form" for one that belongs to none). Nothing typed comes back: the form keeps its own text.
 */
export interface JoinState {
  error: string | null;
  field: JoinField | null;
}

async function portalOn(): Promise<void> {
  // Waiting for the request keeps a build made without the flag from prerendering a static 404 for good.
  await connection();
  if (!getEnv().portalEnabled) notFound();
}

/**
 * The invited person's, or a sign-up from the shared link's, new account (docs/specs/contractor-onboarding.md,
 * section 3). Public on purpose: the single-use or resettable 32-byte token is the check, with a per-IP limit
 * (lib/portal/invites.ts). Success signs them in and goes to the setup steps.
 */
export async function createAccount(_prev: JoinState, formData: FormData): Promise<JoinState> {
  await portalOn();
  const token = String(formData.get("token") ?? "");
  const text = (name: string) => String(formData.get(name) ?? "");
  const view = await resolveJoin(token);
  try {
    const ipHash = await requestIpHash();
    if (view.kind === "invite") {
      await acceptInvite(token, { email: text("email"), password: text("password") }, ipHash);
    } else if (view.kind === "signup") {
      await signUpWithLink(token, { fullName: text("fullName"), phone: text("phone"), email: text("email"), password: text("password") }, ipHash);
    } else {
      // Used or expired since the page loaded: the service words it.
      await acceptInvite(token, { email: text("email"), password: text("password") }, ipHash);
    }
  } catch (err) {
    if (err instanceof InviteError) return { error: err.message, field: err.field };
    throw err;
  }
  redirect("/p/setup");
}

/**
 * Marks a personal invite Opened. Called from the browser after the page loads, never from the server render,
 * because Messages and mail apps fetch a link to draw its preview. Public on purpose: it only stamps a first-open
 * time on a live invite and returns nothing.
 */
export async function openInvite(token: string): Promise<void> {
  await portalOn();
  await markInviteOpened(String(token).slice(0, 200));
}
