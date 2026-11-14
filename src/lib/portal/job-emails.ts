/**
 * Whether a contractor gets task emails (docs/specs/contractor-email-switch.md).
 * One rule, read where an email is queued (tasks/core.ts notify), where it is
 * sent (notifications/content.ts deliveryFor) and where a screen says whether
 * one goes: the login is ACTIVE, they have signed in at least once, and the
 * "Job emails" switch on their Portal access card is on.
 *
 * The first sign-in is `lastSignInAt`, written by authenticatePortalAccount
 * on any sign-in, the starting password's included. A staff password reset
 * leaves it set, so it never makes a contractor quiet again.
 *
 * Password reset emails and the partners' emails about what a contractor did
 * don't read this.
 */

/** The three facts on a login the rule reads. */
export interface JobEmailFacts {
  status: string;
  lastSignInAt: Date | string | null;
  jobEmails: boolean;
}

/** Those facts as a Prisma select on PortalAccount. */
export const JOB_EMAIL_SELECT = { status: true, lastSignInAt: true, jobEmails: true } as const;

/**
 * "on" when task emails go. Otherwise why not, the first that applies: no
 * login that can sign in (none, access removed, or an inactive contact),
 * never signed in, or the switch is off.
 */
export type JobEmailState = "on" | "no-login" | "not-signed-in" | "off";

export function jobEmailState(account: JobEmailFacts | null | undefined, contactActive = true): JobEmailState {
  if (!contactActive || !account || account.status !== "ACTIVE") return "no-login";
  if (!account.lastSignInAt) return "not-signed-in";
  return account.jobEmails ? "on" : "off";
}
