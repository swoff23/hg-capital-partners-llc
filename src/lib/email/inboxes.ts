import { INVOICE_INBOX } from "@/lib/invoices/fields";
import { replyToken } from "./inbound";

/**
 * Which inbox a received email belongs to, by the addresses it was sent to (docs/contractor-invoices-plan.md, 4.3).
 * Resend posts every email on the receiving domain to one webhook (src/app/api/email/inbound), so the router reads
 * the recipients before any inbox sees it:
 *
 *  - an `r+<token>@` reply address on our domain goes to job replies (src/lib/email/replies.ts), whatever else it was
 *    sent to: the token is the job's own secret, and a Done job's reply with a bill makes its invoice there (4.2). When
 *    no job takes it (an expired or retired token, a job taken off them) and invoices@ was on it too, it goes on to the invoice inbox
 *    (fallbackInbox), so a bill is never dropped there;
 *  - a named inbox's address on our domain (`invoices@`) goes to that inbox's handler;
 *  - anything else (`jobs@`, a mail app that ignored Reply-To) goes to job replies as it always has.
 *
 * So an invoice email never reaches the reply path, and a job reply never reaches the invoice inbox. New inboxes
 * planned on the same webhook (`deals@`, `draws@`) add a row to NAMED_INBOXES and a handler in router.ts.
 */

/** The inboxes with an address of their own, by the address's local part. */
export const NAMED_INBOXES = { invoices: INVOICE_INBOX } as const;

export type NamedInbox = keyof typeof NAMED_INBOXES;
export type Inbox = "reply" | NamedInbox;

/** The bare address of one recipient entry ("Zack <zack@x.com>" or "zack@x.com"), lowercased. */
function bareAddress(raw: string): string {
  return (/<([^<>]+)>\s*$/.exec(raw)?.[1] ?? raw).trim().toLowerCase();
}

/** The domain of an EMAIL_FROM ("HG Capital <jobs@mail.example.com>"), which receives too (replies.ts replyAddress). */
export function receivingDomain(from: string): string | null {
  const d = bareAddress(from).split("@")[1]?.trim();
  return d ? d : null;
}

/** The local parts of the recipients on our own `domain`, lowercased. */
function oursLocalParts(recipients: readonly string[], domain: string | null): string[] {
  if (!domain) return [];
  const at = `@${domain.toLowerCase()}`;
  return recipients
    .map(bareAddress)
    .filter((a) => a.endsWith(at))
    .map((a) => a.slice(0, a.lastIndexOf("@")));
}

/**
 * The named inbox an email went to on our own `domain`, whatever else it went to: a forward that also went to
 * invoices@gmail.com is no invoice of ours.
 */
export function namedInboxFor(recipients: readonly string[], domain: string | null): NamedInbox | null {
  const ours = new Set(oursLocalParts(recipients, domain));
  for (const [inbox, localPart] of Object.entries(NAMED_INBOXES) as [NamedInbox, string][]) {
    if (ours.has(localPart)) return inbox;
  }
  return null;
}

/**
 * The inbox for an email sent to `recipients`, on the receiving `domain`. A reply token counts only on our own
 * domain (an `r+` address on someone else's is no job's), and a named inbox's local part likewise.
 */
export function inboxFor(recipients: readonly string[], domain: string | null): Inbox {
  if (domain) {
    const at = `@${domain.toLowerCase()}`;
    if (replyToken(recipients.filter((r) => bareAddress(r).endsWith(at)))) return "reply";
  } else if (replyToken(recipients)) return "reply";
  return namedInboxFor(recipients, domain) ?? "reply";
}

/**
 * Where an email the reply path took no job for goes next: a named inbox it also went to, so the bill still lands.
 * The reply path takes no job for it when it turns it down ("no job": a token no job resolves), or forwards it to the
 * partners for a job the sender can't post on (a link Remove access retired, a job taken off them, their login off,
 * a job since deleted). A Done job's forward ("closed") stands: the reply path makes that invoice itself (4.2). Null
 * when the reply path's answer stands.
 */
export function fallbackInbox(outcome: { outcome: string; reason?: string; why?: string; invoiced?: true }, recipients: readonly string[], domain: string | null): NamedInbox | null {
  const noJob = outcome.outcome === "ignored" && outcome.reason === "no job";
  const cantPost = outcome.outcome === "forwarded" && !outcome.invoiced && !!outcome.why && outcome.why !== "closed";
  if (!noJob && !cantPost) return null;
  return namedInboxFor(recipients, domain);
}
