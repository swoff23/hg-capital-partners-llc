import "server-only";
import { getEnv } from "@/lib/env";
import { handleInvoiceEmail } from "@/lib/invoices/inbox";
import type { InvoiceEmailOutcome } from "@/lib/invoices/inbound";
import { fallbackInbox, inboxFor, receivingDomain, type Inbox } from "./inboxes";
import { fetchReceivedEmail, recipientsOf, type ReceivedEmail } from "./received";
import { handleReceivedEmail, type ReplyOutcome } from "./replies";

/**
 * Every received email, by its inbox (docs/contractor-invoices-plan.md, 4.3): read from Resend once, then handed to
 * the one inbox its recipients name (inboxes.ts inboxFor). Job replies go to replies.ts as they always have; the
 * invoice address goes to the invoice inbox. A new inbox is a row in inboxes.ts NAMED_INBOXES and a handler here.
 */

export type RoutedOutcome = (ReplyOutcome | InvoiceEmailOutcome | { outcome: "ignored"; reason: string }) & { inbox?: Inbox };

type Handlers = { [K in Inbox]: (emailId: string, email: ReceivedEmail) => Promise<ReplyOutcome | InvoiceEmailOutcome> };

export async function routeReceivedEmail(emailId: string): Promise<RoutedOutcome> {
  const config = getEnv().email;
  if (!config) return { outcome: "ignored", reason: "email off" };
  // Keyed by the webhook's id, as replies.ts keys its comment, whatever the read hands back.
  const email: ReceivedEmail = { ...(await fetchReceivedEmail(config, emailId)), id: emailId };
  const handlers: Handlers = {
    reply: (id, e) => handleReceivedEmail(id, e),
    invoices: (_id, e) => handleInvoiceEmail(config, e),
  };
  const recipients = recipientsOf(email);
  const domain = receivingDomain(config.from);
  const inbox = inboxFor(recipients, domain);
  const outcome = await handlers[inbox](emailId, email);
  // A reply token no job takes, on an email that also went to invoices@: the bill still lands in Invoices.
  const next = inbox === "reply" ? fallbackInbox(outcome, recipients, domain) : null;
  if (next) return { ...(await handlers[next](emailId, email)), inbox: next };
  return { ...outcome, inbox };
}
