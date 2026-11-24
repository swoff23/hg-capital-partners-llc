import { INVOICE_INBOX } from "./fields";

/** Where invoices are received when no sending domain is set: the domain Resend receives for (4.3). */
export const DEFAULT_INVOICE_DOMAIN = "mail.hgcapitalpartners.com";

/**
 * The address a contractor can email an invoice to (docs/contractor-invoices-plan.md, 4.3, 6 item 6): the invoice
 * inbox on the sending domain, as a job email's reply address is (email/inbound.ts replyAddress), so it follows
 * whichever domain Resend receives for. `from` is EMAIL_FROM, "HG Capital <jobs@mail.hgcapitalpartners.com>" or a
 * bare address; with none, the production domain.
 */
export function invoiceAddress(from: string | null | undefined): string {
  const address = /<([^>]+)>/.exec(from ?? "")?.[1] ?? from ?? "";
  const domain = address.split("@")[1]?.trim().toLowerCase();
  return `${INVOICE_INBOX}@${domain || DEFAULT_INVOICE_DOMAIN}`;
}
