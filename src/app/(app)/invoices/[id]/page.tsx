import { cache } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { getInvoice } from "@/lib/invoices/queries";
import { jobAddresses, contractorChoices, jobChoices } from "./load";
import { InvoicePage } from "./invoice-page";
import type { Metadata } from "next";

const load = cache(getInvoice);

/** The tab names the invoice, so tabs can be told apart; a signed-out request gets nothing. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await getCurrentUser())) return {};
  const invoice = await load((await params).id);
  return invoice ? { title: invoice.title } : {};
}

/**
 * An invoice's page (docs/contractor-invoices-plan.md, section 6, item 2): loads it and the two lists its pickers
 * offer, and hands them to InvoicePage (./invoice-page.tsx). Only To review lists jobs to tack on; after Approve the
 * fields read as text. Partners only: requireUser admits staff logins, never a contractor's portal account.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const invoice = await load(id);
  if (!invoice) notFound();
  const editable = invoice.stage === "REVIEW";
  const [contractors, jobs, addresses] = await Promise.all([
    editable ? contractorChoices(invoice.contact?.id ?? null) : Promise.resolve([]),
    editable ? jobChoices() : Promise.resolve([]),
    jobAddresses(invoice.jobs.flatMap((j) => (j.taskId ? [j.taskId] : []))),
  ]);
  // The contractor's name still reads in To pay and Paid, from the invoice itself.
  const named = invoice.contact ? [{ id: invoice.contact.id, name: invoice.contact.name, company: null, email: invoice.contact.email, active: true }] : [];
  return (
    <InvoicePage
      invoice={invoice}
      contractors={editable ? contractors : named}
      jobChoices={jobs}
      addresses={addresses}
      today={todayYmdEastern()}
      now={new Date().toISOString()}
    />
  );
}
