"use client";
import { useState } from "react";
import type { MediaItem, MediaUrlFor } from "@/components/lightbox";
import { LazyLightbox } from "@/components/lightbox-lazy";
import { fmtDay, type Ymd } from "@/lib/dates";
import { formatCents } from "@/lib/invoices/email-content";
import type { ContractorStage } from "@/lib/invoices/fields";
import { cn } from "@/lib/utils";

/**
 * A contractor's invoices as rows (docs/contractor-invoices-plan.md, 6.1 items 2, 7 and 8; drawings 06, 07 and 15):
 * the job page's Invoices section, the Your invoices page and the sent screen draw the same row. The number over the
 * job (or "No job") and the day it was sent, the total, and the stage as one plain word: Received and Approved in
 * `--fg-2`, Paid with its date in `--ok`. No badge. A row with a file opens it in the viewer, signed in only, so the
 * row is a button; with none (an emailed amount with no PDF) it just reads.
 *
 * From 480 the total and the stage sit in two fixed columns, so they line up down the list. Below 480 (InvoiceLine)
 * the Your invoices row puts the total on the title line and the stage at the head of the subline; the job page's
 * stacks them at the end. Neither ever truncates, down to 320: only the invoice's and the job's titles do.
 */

export interface InvoiceLineData {
  id: string;
  /** "Invoice #1043", or "Invoice". */
  title: string;
  /** The jobs it's for that they can open; none reads "No job" on the Your invoices page. */
  jobs: { taskId: string; title: string }[];
  totalCents: number | null;
  stage: ContractorStage;
  /** "Received", "Approved", "Paid Nov 13". */
  stageWord: string;
  /** The day it was sent, or a partner's own entry's invoice date. */
  sentOn: Ymd;
  /** "Sent", or "Dated" for a partner's own entry, which the contractor never sent. */
  dateWord: "Sent" | "Dated";
  /** When it was sent (an ISO instant), for the viewer's byline: a Ymd read as an instant is UTC midnight, a day early. */
  sentAt: string;
  files: { id: string; filename: string; contentType: string | null }[];
}

/** The job's name for a row's second line: the first job, "+1" for each more, and "No job" for none. */
function jobWords(jobs: InvoiceLineData["jobs"]): string {
  if (jobs.length === 0) return "No job";
  return jobs.length === 1 ? jobs[0].title : `${jobs[0].title} +${jobs.length - 1}`;
}

/**
 * One row's look, with no behavior of its own. `showJob` is off on a job's own page, where every row is that job's.
 *
 * With the job shown (Your invoices, drawing 07 C), below 480 the total rides the title line and the stage leads the
 * subline, as job rows do: "Received · Fix leak, Unit 2"; the sent date drops. On a job's own page (drawing 06) the
 * subline is the sent date at every width, with the total over the stage at the end of the row below 480.
 */
export function InvoiceLine({
  invoice,
  today,
  showJob,
  className,
}: {
  invoice: Pick<InvoiceLineData, "title" | "jobs" | "totalCents" | "stage" | "stageWord" | "sentOn" | "dateWord">;
  today: Ymd;
  showJob: boolean;
  className?: string;
}) {
  const sent = `${invoice.dateWord} ${fmtDay(invoice.sentOn, { year: "auto", now: today })}`;
  const total = invoice.totalCents != null ? formatCents(invoice.totalCents) : "—";
  const stageTone = invoice.stage === "PAID" ? "text-ok" : "text-fg-2";
  return (
    <span className={cn("flex min-h-14 w-full items-center gap-3 py-2.5 text-left", className)}>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-body font-medium text-foreground">{invoice.title}</span>
          {showJob && <span className="shrink-0 whitespace-nowrap text-body tabular-nums text-foreground min-[480px]:hidden">{total}</span>}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center text-meta text-muted-foreground">
          {showJob && (
            <>
              <span className={cn("shrink-0 whitespace-nowrap min-[480px]:hidden", stageTone)}>{invoice.stageWord}</span>
              <span aria-hidden="true" className="shrink-0 whitespace-pre min-[480px]:hidden"> · </span>
              <span className="min-w-0 truncate">{jobWords(invoice.jobs)}</span>
              <span aria-hidden="true" className="shrink-0 whitespace-pre max-[479px]:hidden"> · </span>
            </>
          )}
          <span className={cn("shrink-0 whitespace-nowrap", showJob && "max-[479px]:hidden")}>{sent}</span>
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 flex-col items-end min-[480px]:flex-row min-[480px]:items-center",
          showJob ? "hidden min-[480px]:flex" : "flex",
        )}
      >
        <span className="whitespace-nowrap text-body tabular-nums text-foreground min-[480px]:w-24 min-[480px]:text-right">{total}</span>
        <span className={cn("mt-0.5 whitespace-nowrap text-meta min-[480px]:mt-0 min-[480px]:w-32 min-[480px]:text-right", stageTone)}>
          {invoice.stageWord}
        </span>
      </span>
    </span>
  );
}

const fileUrl: MediaUrlFor = (item) => `/api/files/invoice/${item.id}`;

const isPhoto = (f: InvoiceLineData["files"][number]) => !!f.contentType?.startsWith("image/");

/**
 * The rows on hairlines, and the viewer for their files. A tap opens that invoice's files in Lightbox on the portal's
 * ground: a photo as a photo, a PDF in its frame with a mouse and as a file card on touch (the viewer's own rule).
 */
export function InvoiceList({ invoices, today, showJob }: { invoices: InvoiceLineData[]; today: Ymd; showJob: boolean }) {
  const [viewing, setViewing] = useState<{ open: boolean; invoice: InvoiceLineData | null; index: number }>({ open: false, invoice: null, index: 0 });
  const items: MediaItem[] = (viewing.invoice?.files ?? []).map((f) => ({
    id: f.id,
    kind: isPhoto(f) ? "IMAGE" : "FILE",
    filename: f.filename,
    createdAt: viewing.invoice?.sentAt ?? "",
  }));
  return (
    <>
      <ul className="divide-y divide-border">
        {invoices.map((inv) => (
          <li key={inv.id}>
            {inv.files.length > 0 ? (
              <button
                type="button"
                onClick={() => setViewing({ open: true, invoice: inv, index: 0 })}
                aria-label={`${inv.title}, ${inv.totalCents != null ? formatCents(inv.totalCents) : "no total"}, ${inv.stageWord}. Open the file`}
                className="block w-full transition-colors hover:bg-muted focus-visible:-outline-offset-2"
              >
                <InvoiceLine invoice={inv} today={today} showJob={showJob} />
              </button>
            ) : (
              <InvoiceLine invoice={inv} today={today} showJob={showJob} />
            )}
          </li>
        ))}
      </ul>
      <LazyLightbox
        items={items}
        index={viewing.index}
        onIndexChange={(index) => setViewing((v) => ({ ...v, index }))}
        isOpen={viewing.open}
        onOpenChange={(open) => setViewing((v) => ({ ...v, open }))}
        urlFor={fileUrl}
        surface="portal"
      />
    </>
  );
}
