import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { invoiceAddress } from "@/lib/invoices/address";
import { contractorInvoices } from "@/lib/invoices/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { InvoiceAddressCard, InvoiceAddressLine } from "../_components/invoice-address";
import { InvoiceList } from "../_components/invoice-list";
import { JobHeader } from "../jobs/[id]/_components/job-header";

export const metadata: Metadata = { title: "Your invoices" };

/**
 * Your invoices (docs/contractor-invoices-plan.md, M14 and 6 item 6; drawings 07, option C, and 15, option B): every
 * invoice of theirs they may see, with a job or without, newest first, from the account menu, with My jobs as the
 * way back. The reads hold the visibility rule (their own, never Not an invoice, an emailed or staff-entered one
 * only once approved, Paid only after its Undo window), and a one-job link session sees none of it:
 * requirePortalPrincipal sends it to sign in, and the query answers empty for it anyway. A list, so it runs to 1600
 * like My jobs, under the job page's header.
 */
export default async function YourInvoicesPage() {
  const principal = await requirePortalPrincipal();
  const invoices = await contractorInvoices({ contactId: principal.contactId, onlyTaskId: principal.onlyTaskId });
  const address = invoiceAddress(getEnv().email?.from);

  return (
    <>
      <JobHeader wide />
      <main className="mx-auto max-w-400 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="text-title text-balance text-foreground">Your invoices</h1>
        {invoices.length > 0 ? (
          <>
            <InvoiceAddressLine address={address} />
            <div className="mt-4">
              <InvoiceList invoices={invoices} today={todayYmdEastern()} showJob />
            </div>
          </>
        ) : (
          <EmptyState action={<InvoiceAddressCard address={address} />}>Invoices you send show up here.</EmptyState>
        )}
      </main>
    </>
  );
}
