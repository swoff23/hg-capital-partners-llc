import type { InvoiceView } from "@/lib/invoices/fields";
import type { InvoiceJob } from "@/lib/invoices/queries";

/** The list's address for a view: To review is the default, so it keeps the bare path (as Draws does for Open). */
export function viewHref(view: InvoiceView): string {
  return view === "review" ? "/invoices" : `/invoices?view=${view}`;
}

/**
 * The line over To review when invoice emails were dropped over the day's caps (plan 4.3, 6.1 item 3): the full
 * line from sm up and a shorter one on a phone, which holds one line at 320 up to 9 emails.
 */
export function droppedLines(n: number): { long: string; short: string } {
  const one = n === 1;
  return {
    long: `${n} invoice ${one ? "email" : "emails"} over today's limit ${one ? "wasn't" : "weren't"} saved.`,
    short: `${n} ${one ? "email" : "emails"} over the limit ${one ? "wasn't" : "weren't"} saved.`,
  };
}

/** The first job on a row, and how many more follow it ("+1"). */
export function jobSummary(jobs: readonly InvoiceJob[]): { first: { title: string; place: string | null } | null; more: number } {
  const [first, ...rest] = jobs;
  return { first: first ? { title: first.title, place: first.place ?? null } : null, more: rest.length };
}

/** The empty line for each view (plan 6.1, item 3). */
export const EMPTY_LINE: Record<InvoiceView, string> = {
  review: "Nothing to review. New invoices land here.",
  pay: "Nothing to pay. Approved invoices land here.",
  paid: "No paid invoices yet.",
};
