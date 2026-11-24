import { Plus, TriangleAlert } from "lucide-react";
import { Money } from "@/components/money";
import { Notice } from "@/components/source-line";
import { SpotArt } from "@/components/spot-art";
import { EmptyState, LinkButton, PageHeader, RowCell, Table, Th, chromeIconClass, pendingRowFill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import { readInvoiceView } from "@/lib/invoices/fields";
import { listInvoices, type InvoiceRow } from "@/lib/invoices/queries";
import { cn } from "@/lib/utils";
import { Flags } from "../flags";
import { EMPTY_LINE, droppedLines, jobSummary } from "../lines";
import { ViewSwitch } from "../view-switch";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Invoices" };

/**
 * Invoices (docs/contractor-invoices-plan.md, section 6, item 1; drawing 02, option A): New invoice, a switch
 * (To review | To pay | Paid) kept in the URL, and one table, built like Draws. The whole row opens the invoice.
 * From sm each row is contractor (its flags under the name), invoice number, jobs, date and total; below sm it
 * is two lines, the contractor over the flags and the number and job, with the total over its date. To review
 * and To pay run oldest first so nothing sits, Paid newest first.
 */
export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  await requireUser();
  const view = readInvoiceView((await searchParams).view);
  const { rows, counts, droppedToday } = await listInvoices(view);
  const today = todayYmdEastern();
  const dropped = view === "review" && droppedToday > 0 ? droppedLines(droppedToday) : null;

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <LinkButton href="/invoices/new" variant="primary">
            <Plus aria-hidden="true" className={chromeIconClass} />
            New invoice
          </LinkButton>
        }
      />
      <div className="mb-4">
        <ViewSwitch view={view} counts={counts} />
      </div>

      {dropped && (
        <Notice className="mb-4" icon={<TriangleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-warn" />}>
          <span className="max-sm:hidden">{dropped.long}</span>
          <span className="sm:hidden">{dropped.short}</span>
        </Notice>
      )}

      {rows.length === 0 ? (
        <EmptyState>
          {view === "review" && <SpotArt name="all-clear" className="mx-auto mb-3 size-24 text-foreground max-sm:size-18" />}
          {EMPTY_LINE[view]}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="pl-0">Contractor</Th>
              <Th className="max-sm:hidden">Invoice</Th>
              <Th className="max-sm:hidden">Jobs</Th>
              <Th className="max-sm:hidden">Date</Th>
              <Th numeric className="pr-0">
                Total
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <Row key={row.id} row={row} today={today} />
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function Row({ row, today }: { row: InvoiceRow; today: string }) {
  const href = `/invoices/${row.id}`;
  const { first, more } = jobSummary(row.jobs);
  const date = fmtDay(row.date, { year: "auto", now: today });
  const name = row.contact?.name ?? row.senderEmail ?? "No contractor";
  const flagged = row.possibleDuplicate || row.needsContractor;
  // The phone's second line: the number and the first job, which the other columns carry from sm up.
  const detail = [
    row.invoiceNumber ? `#${row.invoiceNumber}` : null,
    first ? [first.title, first.place].filter(Boolean).join(" · ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const phoneDetail = more > 0 && detail ? `${detail} +${more}` : detail;

  return (
    <tr className={cn("transition-colors duration-fast hover:bg-muted", pendingRowFill)}>
      <RowCell href={href} first cell="w-full max-w-0 sm:w-64 sm:max-w-64" className="pl-0 max-sm:py-2">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body", row.contact ? "text-foreground" : "text-muted-foreground")}>{name}</span>
          <Flags row={row} className="flex min-w-0 flex-col text-meta max-sm:hidden" />
          {(flagged || phoneDetail) && (
            <span className="flex min-w-0 text-meta text-muted-foreground sm:hidden">
              {flagged && (
                <>
                  <Flags row={row} firstOnly className="flex shrink-0 gap-2" />
                  {phoneDetail && <span className="shrink-0 whitespace-pre">{" · "}</span>}
                </>
              )}
              <span className="min-w-0 truncate">{phoneDetail}</span>
            </span>
          )}
        </span>
      </RowCell>
      <RowCell href={href} cell="max-sm:hidden" className="whitespace-nowrap text-body">
        {row.invoiceNumber ? `#${row.invoiceNumber}` : <span className="text-muted-foreground">—</span>}
      </RowCell>
      <RowCell href={href} cell="w-full max-w-0 max-sm:hidden" className="text-body">
        {first ? (
          <span className="flex min-w-0 gap-1">
            <span className="min-w-0 truncate">{first.title}</span>
            {first.place && <span className="min-w-0 shrink-[3] truncate text-muted-foreground">· {first.place}</span>}
            {more > 0 && <span className="shrink-0 text-muted-foreground">+{more}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </RowCell>
      <RowCell href={href} cell="max-sm:hidden" className="whitespace-nowrap text-body">
        {date}
      </RowCell>
      <RowCell href={href} numeric className="pr-0 max-sm:py-2">
        <span className="flex flex-col items-end">
          <Money value={row.totalCents == null ? null : Math.round(row.totalCents / 100)} />
          <span className="text-meta text-muted-foreground sm:hidden">{date}</span>
        </span>
      </RowCell>
    </tr>
  );
}

export const dynamic = "force-dynamic";
