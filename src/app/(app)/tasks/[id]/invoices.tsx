import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Section } from "@/components/ui";
import { fmtDay, type Ymd } from "@/lib/dates";
import { formatCents } from "@/lib/invoices/email-content";
import { STAGE_LABEL } from "@/lib/invoices/fields";
import type { TaskInvoiceRow } from "@/lib/invoices/queries";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

/**
 * The task page's Invoices section (docs/contractor-invoices-plan.md M13, 6.1 item 6; drawing 05, option B): the
 * job's invoices in rows like the files list, between Checklist and Photos and files. Each row is a receipt icon,
 * the number, then the total and the stage in fixed columns so they line up; one line at 320, where a long number
 * truncates first. An invoice with no number shows its invoice date; a contractor's first name shows only when
 * the job's invoices come from more than one contractor. Oldest first (the query's order). A click or tap opens
 * the invoice page and Back returns to the task. Nothing while the job has no invoice, so a chore never shows an
 * empty section; New invoice lives in the page's ⋯ menu. Paid is --ok, the other stages --fg-2.
 */
export function TaskInvoices({ invoices, today }: { invoices: TaskInvoiceRow[]; today: Ymd }) {
  if (invoices.length === 0) return null;
  const senders = new Set(invoices.map((i) => i.contact?.id ?? ""));
  const named = senders.size > 1;
  return (
    <Section
      title={
        <>
          Invoices
          <span className="ml-1 font-normal tabular-nums text-muted-foreground">{invoices.length}</span>
        </>
      }
    >
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {invoices.map((inv) => {
          const label = inv.invoiceNumber ? `#${inv.invoiceNumber}` : fmtDay(inv.invoiceDate, { year: "auto", now: today });
          const who = named && inv.contact ? firstName(inv.contact.name) || inv.contact.name : null;
          const total = inv.totalCents != null ? formatCents(inv.totalCents) : "—";
          return (
            <li key={inv.id}>
              <Link
                href={`/invoices/${inv.id}`}
                aria-label={`${inv.title}, ${total}, ${STAGE_LABEL[inv.stage]}`}
                // The focus outline drawn inside, where the list's rounded clip can't cut it.
                className="flex min-h-10 min-w-0 items-center gap-2.5 px-3 text-body text-foreground transition-colors hover:bg-muted focus-visible:-outline-offset-2 pointer-coarse:min-h-12"
              >
                <ReceiptText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {label}
                  {who && <span className="text-muted-foreground"> · {who}</span>}
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">{total}</span>
                <span className={cn("w-16 shrink-0 text-right text-meta", inv.stage === "PAID" ? "text-ok" : "text-fg-2")}>{STAGE_LABEL[inv.stage]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
