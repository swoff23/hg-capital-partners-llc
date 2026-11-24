import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { renderPlainEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { loginThrottle } from "@/lib/login-throttle";
import { firstName } from "./job-view";
import type { PortalPrincipal } from "./session";
import { findSignInLink, finishSignInLinkTx, requestSignInLinkTx, type SignInLinkRequest, type SignInLinkResult, type UsableSignInLink } from "./sign-in-link-core";

/**
 * "Email me a sign-in link" from Welcome back (sign-in-link-core.ts says
 * why). Only a session an email's job link started may ask: a full session
 * is already signed in, and someone the job was shared with (a crew link)
 * isn't the contractor. The email goes after the response; the page answers
 * the same whether it was sent, held back by the hourly limit, or refused.
 */
export async function emailSignInLink(principal: PortalPrincipal, ipHash: string): Promise<void> {
  if (!principal.onlyTaskId || principal.shared) return;
  const request = await prisma.$transaction((tx) => requestSignInLinkTx(tx, { accountId: principal.accountId, ipHash, now: new Date() }));
  if (request) after(() => sendSignInLinkEmail(request));
}

const LINK_PATH = "/login/link";

async function sendSignInLinkEmail(request: SignInLinkRequest): Promise<void> {
  try {
    const { text, html } = renderPlainEmail({
      line: `Hi ${firstName(request.name)}, here's your link to sign in to HG Capital jobs.`,
      buttonLabel: "Sign in",
      buttonUrl: `${getEnv().appUrl}${LINK_PATH}?token=${request.token}`,
      footnote: "The link works once, for 15 minutes. If you didn't ask for it, you can ignore this email.",
    });
    const res = await sendEmail({ to: request.email, subject: "Sign in to HG Capital", text, html });
    // Counted against the daily email cap once it went, as a reset email is (notifications/sent-count.ts).
    if (res.ok) await prisma.securityEvent.updateMany({ where: { id: request.eventId }, data: { data: { ...request.data, sent: true } } });
  } catch (err) {
    logError("portal:sign-in-link-email", err);
  }
}

/** For the link's page: whose it is, while it still works. Read-only. */
export async function signInLinkOwner(token: string): Promise<UsableSignInLink | null> {
  return findSignInLink(prisma, token, new Date());
}

/** Spend the link (sign-in-link-core.ts finishSignInLinkTx), clearing the login's failed-password count when it signs in. */
export async function finishSignInLink(token: string, ipHash: string): Promise<SignInLinkResult | null> {
  const result = await prisma.$transaction((tx) => finishSignInLinkTx(tx, token, ipHash, new Date()));
  if (result?.kind === "signed-in") loginThrottle.reset(result.link.email);
  return result;
}
