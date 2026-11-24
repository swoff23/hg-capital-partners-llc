import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { invoiceAddress } from "@/lib/invoices/address";
import { contractorInvoices } from "@/lib/invoices/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { readSetupCard } from "@/lib/portal/setup";
import { AccountMenu } from "../_components/account-menu";
import { InvoiceAddressCard, InvoiceAddressLine } from "../_components/invoice-address";
import { InvoiceList } from "../_components/invoice-list";
import { PortalHeader } from "../_components/portal-header";

export const metadata: Metadata = { title: "Your invoices" };

/**
 * Your invoices (docs/contractor-invoices-plan.md, M14 and 6 item 6; drawings 07, option C, and 15, option B): every
 * invoice of theirs they may see, with a job or without, newest first, under the Invoices tab of the portal's bar
 * (Connor, Nov 24, docs/specs/contractor-top-nav.md). The reads hold the visibility rule (their own, never Not an invoice, an emailed or staff-entered one
 * only once approved, Paid only after its Undo window), and a one-job link session sees none of it:
 * requirePortalPrincipal sends it to sign in, and the query answers empty for it anyway. A list, so it runs to 1600
 * like My jobs, under the same bar.
 */
export default async function YourInvoicesPage() {
  const principal = await requirePortalPrincipal();
  // `setup` only decides the account menu's "Your details and files", as on My jobs.
  const [invoices, setup] = await Promise.all([
    contractorInvoices({ contactId: principal.contactId, onlyTaskId: principal.onlyTaskId }),
    readSetupCard(principal.contactId),
  ]);
  const address = invoiceAddress(getEnv().email?.from);

  return (
    <>
      <PortalHeader account={<AccountMenu name={principal.label} email={principal.email} setupLink={setup !== null} />} />
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
