import type { InvoicePayMethod } from "@prisma/client";
import { fmtDay, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import type { JobEmailState } from "@/lib/portal/job-emails";
import { cleanInvoiceNumber } from "./fields";

/**
 * What the invoice emails say (docs/contractor-invoices-plan.md, 5.3) and the Mark paid toast's clause about who
 * hears. Pure; see email-content.test.ts. notify.ts queues and reads the rows, and outbox.ts sends what these build.
 *
 *   The partners' bundle (M12)  "3 new invoices to review", one line per invoice, Review invoices
 *   The contractor's Paid (M15) "Paid: Invoice #1043, $850.00", the day and the method, See your invoices
 */

/** "$1,043.10" from integer cents: the sum and the subject never pass through a float of dollars. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(Math.trunc(cents));
  const dollars = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${String(a % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The partners' bundle (M12)
// ---------------------------------------------------------------------------

/** One invoice in the partners' email, as it stands when the email goes. */
export interface ReviewLine {
  /** The contractor's name, when someone knows it. */
  contactName: string | null;
  /** The From of the email it came in, for one with no contractor yet ("Who's this from?"). */
  senderEmail: string | null;
  invoiceNumber: string | null;
  totalCents: number | null;
}

/** The most invoices the email lists before "and 3 more". */
export const REVIEW_LINES_MAX = 5;

/** "3 new invoices to review". */
export function reviewSubject(count: number): string {
  return count === 1 ? "1 new invoice to review" : `${count} new invoices to review`;
}

/** "Zack Brown · #1043 · $850.00", "zack@gmail.com · $850.00", "No contractor yet". */
export function reviewLine(line: ReviewLine): string {
  const who = line.contactName?.trim() || line.senderEmail?.trim() || "No contractor yet";
  const number = cleanInvoiceNumber(line.invoiceNumber);
  return [who, number ? `#${number}` : null, line.totalCents != null ? formatCents(line.totalCents) : null].filter(Boolean).join(" · ");
}

export interface ReviewEmail {
  subject: string;
  line: string;
  items: string[];
  buttonLabel: string;
  buttonUrl: string;
}

/** The whole bundle for one partner: who it greets, the invoices still in To review, oldest first. */
export function reviewEmail(input: { recipientName: string | null; lines: readonly ReviewLine[]; appUrl: string }): ReviewEmail {
  const n = input.lines.length;
  const name = firstName(input.recipientName);
  const shown = input.lines.slice(0, REVIEW_LINES_MAX).map(reviewLine);
  const more = n - shown.length;
  return {
    subject: reviewSubject(n),
    line: n === 1 ? (name ? `Hi ${name}, a new invoice came in.` : "A new invoice came in.") : `${name ? `Hi ${name}, ` : ""}${n} new invoices came in.`,
    items: more > 0 ? [...shown, `and ${more} more`] : shown,
    buttonLabel: "Review invoices",
    buttonUrl: `${input.appUrl.replace(/\/+$/, "")}/invoices?view=review`,
  };
}

// ---------------------------------------------------------------------------
// The contractor's Paid email (M15)
// ---------------------------------------------------------------------------

/**
 * How a method reads after the day: "on Nov 13 by check", "on Nov 13 in cash". Other says nothing more. The Paid
 * email and the invoice page's paid line both word it this way.
 */
export const PAID_BY: Record<InvoicePayMethod, string> = {
  BASELANE: "by Baselane transfer",
  CHECK: "by check",
  ZELLE: "by Zelle",
  VENMO: "by Venmo",
  CASH: "in cash",
  CARD: "by card",
  OTHER: "",
};

/** "Paid: Invoice #1043, $850.00", or "Paid: Invoice, $850.00" with no number. */
export function paidSubject(input: { invoiceNumber: string | null; totalCents: number | null }): string {
  const number = cleanInvoiceNumber(input.invoiceNumber);
  const invoice = number ? `Invoice #${number}` : "Invoice";
  return input.totalCents != null ? `Paid: ${invoice}, ${formatCents(input.totalCents)}` : `Paid: ${invoice}`;
}

export interface PaidEmail {
  subject: string;
  line: string;
  items: string[];
  buttonLabel: string;
  buttonUrl: string;
}

/**
 * The Paid email for one invoice. Its one button opens Your invoices through sign-in, never a job link (M15), and
 * it carries no reply address of its own, so a "thanks" goes to the plain reply address.
 */
export function paidEmail(input: {
  contactName: string | null;
  invoiceNumber: string | null;
  totalCents: number | null;
  paidOn: Ymd | Date;
  method: InvoicePayMethod | null;
  today: Ymd;
  appUrl: string;
}): PaidEmail {
  const name = firstName(input.contactName);
  const number = cleanInvoiceNumber(input.invoiceNumber);
  const day = fmtDay(input.paidOn, { year: "auto", now: input.today });
  const how = input.method ? PAID_BY[input.method] : "";
  const amount = input.totalCents != null ? `${formatCents(input.totalCents)} ` : "";
  return {
    subject: paidSubject(input),
    line: `${name ? `Hi ${name}, ` : ""}HG Capital paid your invoice${number ? ` #${number}` : ""}.`,
    items: [`${amount ? `${amount}paid` : "Paid"} on ${day}${how ? ` ${how}` : ""}.`],
    buttonLabel: "See your invoices",
    buttonUrl: `${input.appUrl.replace(/\/+$/, "")}/p/invoices`,
  };
}

// ---------------------------------------------------------------------------
// Mark paid's toast (5.3)
// ---------------------------------------------------------------------------

/**
 * The clause after "Marked paid ·", from the contractor's jobEmailState, in the words comment-card.tsx's
 * DeliveryLine uses: "Zack gets an email", "Zack hasn't signed in yet", "Zack's emails are off", "Zack has no
 * login yet". Null with no contractor, or no name to say.
 */
export function paidToastDetail(contactName: string | null | undefined, state: JobEmailState | null | undefined): string | null {
  const name = firstName(contactName);
  if (!name || !state) return null;
  switch (state) {
    case "on":
      return `${name} gets an email`;
    case "not-signed-in":
      return `${name} hasn't signed in yet`;
    case "off":
      return `${name}'s emails are off`;
    case "no-login":
      return `${name} has no login yet`;
  }
}
