"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { renderPlainEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { joinPath } from "@/lib/contractors/onboarding";
import { firstName } from "@/lib/names";
import { InviteError, currentSignupLink, invitePerson, readInviteContact, resendInvite, resetSignupLink } from "@/lib/portal/invites";
import { withResult } from "@/lib/server-action";

/**
 * Invite contractor, Resend and the Sign-up link (docs/specs/contractor-onboarding.md, 4.2 to 4.4). Staff only.
 * The services own the writes (lib/portal/invites.ts); this adds the link's address and, for Email invite, the
 * email. Text invite and Copy link finish in the browser, which holds the phone's Messages and the clipboard, so
 * the action hands back the link with what the text needs.
 */

const id = z.string().min(1);
const how = z.enum(["text", "email", "copy"]);
export type InviteHow = z.infer<typeof how>;

/** What an invite action hands back for the browser to finish with. `emailed` is false when Email invite was asked for and the mailer refused. */
export type InviteSent = {
  link: string;
  /** The contractor's first name, for the text and the toast. */
  firstName: string;
  phone: string | null;
  email: string | null;
  /** The signed-in partner's first name, for "it's Connor at HG Capital". */
  senderFirstName: string;
  emailed: boolean;
};

/**
 * The origin links are built on: APP_URL, or this request's own origin until it's set (getEnv().appUrl throws in
 * production without it, which would take a staff action down).
 */
async function origin(): Promise<string> {
  const env = getEnv();
  if (env.APP_URL) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : env.appUrl;
}

const linkFor = async (token: string) => `${await origin()}${joinPath(token)}`;

/** The partner's first name, or the start of their email when no name is set. */
const senderOf = (u: { name: string | null; email: string }) => firstName(u.name) || (u.email.split("@")[0] ?? "");

/** An InviteError carries the line to show and the field it belongs on; the sheet's two fields are Name and Mobile or email. */
async function inviteResult<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  let refusal: InviteError | null = null;
  const res = await withResult(name, async () => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InviteError) {
        refusal = err;
        return undefined as T;
      }
      throw err;
    }
  });
  const refused = refusal as InviteError | null;
  if (!refused) return res;
  const field = refused.field === "fullName" ? "fullName" : refused.field === "phone" || refused.field === "email" ? "reach" : null;
  return { ok: false, error: refused.message, ...(field ? { fieldErrors: { [field]: refused.message } } : {}) };
}

/** The invite email: one line, one button, and that the link lasts 14 days. */
async function emailInvite(to: string, first: string, link: string): Promise<boolean> {
  const { text, html } = renderPlainEmail({
    line: first ? `Hi ${first}, set up your HG Capital contractor account.` : "Set up your HG Capital contractor account.",
    buttonLabel: "Set up my account",
    buttonUrl: link,
    footnote: "The link works for 14 days.",
  });
  const res = await sendEmail({ to, subject: "Set up your HG Capital contractor account", text, html });
  return res.ok;
}

/**
 * Invite someone new: adds them to Contractors as Invited and makes their link. With `email` the email goes now;
 * Text invite and Copy link finish on the partner's device.
 */
export async function inviteContractor(input: { fullName: string; reach: string; how: InviteHow }): Promise<ActionResult<InviteSent>> {
  return inviteResult("inviteContractor", async () => {
    const user = await requireUser();
    const parsed = z.object({ fullName: z.string().max(200), reach: z.string().max(320), how }).parse(input);
    // Email invite needs an email, and nothing is created before that's known.
    if (parsed.how === "email" && !readInviteContact(parsed.reach)?.email) throw new InviteError("Enter an email to send the invite by email.", "email");
    const made = await invitePerson({ fullName: parsed.fullName, reach: parsed.reach }, user);
    revalidatePath("/contractors");
    const link = await linkFor(made.token);
    const first = firstName(parsed.fullName);
    const emailed = parsed.how === "email" && made.email ? await emailInvite(made.email, first, link) : false;
    return { link, firstName: first, phone: made.phone, email: made.email, senderFirstName: senderOf(user), emailed };
  });
}

/** A new link for someone invited who hasn't made their account. The old one stops working. */
export async function resendContractorInvite(contactId: string, delivery: InviteHow): Promise<ActionResult<InviteSent>> {
  return inviteResult("resendContractorInvite", async () => {
    const user = await requireUser();
    const parsed = how.parse(delivery);
    const made = await resendInvite(id.parse(contactId), user);
    revalidatePath("/contractors/[id]", "page");
    const link = await linkFor(made.token);
    const emailed = parsed === "email" && made.email ? await emailInvite(made.email, made.firstName, link) : false;
    return { link, firstName: made.firstName, phone: made.phone, email: made.email, senderFirstName: senderOf(user), emailed };
  });
}

/** The shared sign-up link as it stands, made the first time anyone asks. */
export async function getSignupLink(): Promise<ActionResult<{ link: string }>> {
  return withResult("getSignupLink", async () => {
    const user = await requireUser();
    return { link: await linkFor((await currentSignupLink(user)).token) };
  });
}

/** Reset link: the old one stops working at once. */
export async function resetSignupLinkAction(): Promise<ActionResult<{ link: string }>> {
  return withResult("resetSignupLink", async () => {
    const user = await requireUser();
    return { link: await linkFor((await resetSignupLink(user)).token) };
  });
}
