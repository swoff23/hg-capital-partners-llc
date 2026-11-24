"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/source-line";
import { useToast } from "@/components/toast";
import { useRun } from "@/components/use-run";
import { Button } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import { PAID_BY, formatCents } from "@/lib/invoices/email-content";
import { PAY_METHOD_LABEL, STAGE_LABEL, approveBlocker, readTotal } from "@/lib/invoices/fields";
import type { InvoiceRecord } from "@/lib/invoices/queries";
import { firstName } from "@/lib/names";
import { focusRecordMenu } from "@/lib/record-menu-focus";
import {
  approveInvoiceAction,
  backToReviewAction,
  linkJobAction,
  restoreInvoiceAction,
  saveInvoiceFieldsAction,
  unlinkJobAction,
} from "./actions";
import { senderName } from "./email-text";
import { EmailCard, FilePane } from "./file-pane";
import { InvoiceFields, failureToResult, totalText, useSaveFlush, type FieldPatch, type JobRow, type SaveResult } from "./fields";
import { InvoiceHistory } from "./history";
import type { ContractorChoice, JobChoice } from "./load";
import { MarkPaidSheet } from "./mark-paid-sheet";
import { InvoiceMenu } from "./more-menu";

/**
 * An invoice's page (docs/contractor-invoices-plan.md, section 6, item 2; drawings 03, 04 and 11). The header is the
 * record pages': Back with the stage, the ⋯ on the first line, the title below, and once it's Paid the paid line
 * under it. A computer with a mouse draws the file in a frame on the left and the fields in a 420px column on the
 * right; touch and anything narrower than lg stack the file card, the fields and History. The bar holds only the next
 * step: Approve in To review, Mark paid in To pay, and no bar once it's Paid.
 */
export function InvoicePage({
  invoice,
  contractors,
  jobChoices,
  addresses,
  today,
  now,
}: {
  invoice: InvoiceRecord;
  contractors: ContractorChoice[];
  jobChoices: JobChoice[];
  addresses: Record<string, string | null>;
  today: Ymd;
  now: string;
}) {
  const { toast } = useToast();
  const run = useRun();
  const [saved, setSaved] = useState(false);
  const [paying, setPaying] = useState(false);
  const { track, flush } = useSaveFlush();
  // The total as typed, so the bar follows the text and not the last save; null until someone types.
  const [draftTotal, setDraftTotal] = useState<string | null>(null);
  const id = invoice.id;
  const stage = invoice.stage;
  const editable = stage === "REVIEW";

  function save(patch: FieldPatch): Promise<SaveResult> {
    return track(saveNow(patch));
  }

  async function saveNow(patch: FieldPatch): Promise<SaveResult> {
    setSaved(false);
    const res = await callAction(() => saveInvoiceFieldsAction(id, patch));
    if (res.ok) {
      setSaved(true);
      return { ok: true };
    }
    const lost = res.fieldErrors?.stage;
    if (lost) {
      // Another partner moved it first; the page behind already shows where it is.
      toast({ message: lost });
      return { ok: false, errors: {} };
    }
    return failureToResult(res);
  }

  const jobs: JobRow[] = invoice.jobs.map((j) => ({
    linkId: j.linkId,
    taskId: j.taskId,
    title: j.title,
    address: j.taskId ? (addresses[j.taskId] ?? null) : null,
    status: j.status,
  }));

  function addJob(job: JobChoice) {
    run.run(() => linkJobAction(id, job.id), {});
  }
  function removeJob(job: JobRow) {
    const taskId = job.taskId;
    run.run(() => unlinkJobAction(id, { linkId: job.linkId }), {
      done: "Job taken off",
      key: `invoice:${id}:jobs`,
      undo: taskId ? () => linkJobAction(id, taskId) : undefined,
    });
  }

  const typed = draftTotal == null ? null : readTotal(draftTotal);
  const blocker =
    typed == null ? invoice.approveBlocker : approveBlocker({ contactId: invoice.contact?.id ?? null, totalCents: typed.ok ? typed.cents : null });

  async function approve() {
    await flush();
    run.run(() => approveInvoiceAction(id), {
      done: "Approved",
      key: `invoice:${id}:stage`,
      undo: () => backToReviewAction(id),
    });
  }

  const fromName = invoice.email ? firstName(invoice.contact?.name) || firstName(senderName(invoice.email.from)) || null : null;
  const contactName = invoice.contact?.name ?? null;

  return (
    <div className="max-w-300">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-template-areas:'nav_more'_'title_title'_'line_line']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/invoices" label="Invoices" />
          <span aria-hidden="true" className="text-meta text-muted-foreground">
            /
          </span>
          <span className="whitespace-nowrap text-meta text-muted-foreground">{STAGE_LABEL[stage]}</span>
        </div>
        <div className="[grid-area:more]">
          <InvoiceMenu invoiceId={id} stage={stage} paidAt={invoice.paid?.at.toISOString() ?? null} />
        </div>
        <h1 className="min-w-0 py-1 text-title font-semibold text-foreground [grid-area:title] [overflow-wrap:anywhere]">{invoice.title}</h1>
        {invoice.paid && <PaidLine paid={invoice.paid} today={today} />}
      </header>

      {stage === "NOT_INVOICE" && (
        <Notice
          className="mt-4"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={run.pending}
              onClick={() => run.run(() => restoreInvoiceAction(id), { done: "Restored", key: `invoice:${id}:stage`, succeeded: () => focusRecordMenu() })}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restore
            </Button>
          }
        >
          Marked not an invoice.
        </Notice>
      )}

      <div className="mt-4 grid gap-x-10 gap-y-6 lg:pointer-fine:grid-cols-[minmax(0,1fr)_26.25rem]">
        <div className="min-w-0 lg:pointer-fine:sticky lg:pointer-fine:top-[calc(var(--app-bar-h)+1rem)] lg:pointer-fine:h-[calc(100dvh-var(--app-bar-h)-9rem)] lg:pointer-fine:self-start">
          <FilePane invoiceId={id} title={invoice.title} files={invoice.files} email={invoice.email} contactName={contactName} editable={editable} />
        </div>
        <div className="min-w-0 space-y-6">
          {invoice.email && invoice.files.length > 0 && <EmailCard email={invoice.email} contactName={contactName} />}
          <InvoiceFields
            values={{
              contactId: invoice.contact?.id ?? null,
              invoiceNumber: invoice.invoiceNumber ?? "",
              invoiceDate: invoice.invoiceDate,
              total: totalText(invoice.totalCents),
              note: invoice.note ?? "",
            }}
            editable={editable}
            contractors={contractors}
            jobChoices={jobChoices}
            jobs={jobs}
            today={today}
            duplicateOf={invoice.duplicateOf}
            needsContractor={!invoice.contact && invoice.source !== "STAFF"}
            save={save}
            onAddJob={addJob}
            onRemoveJob={removeJob}
            saved={saved}
            onTotalDraft={setDraftTotal}
          />
          <InvoiceHistory events={invoice.history} today={today} now={now} fromName={fromName} />
        </div>
      </div>

      {stage === "REVIEW" && (
        <ActionBar
          placement="app"
          primary={
            <Button className={actionBarButton} pending={run.pending} disabled={!!blocker} onClick={approve}>
              Approve
            </Button>
          }
        />
      )}
      {stage === "TO_PAY" && (
        <ActionBar
          placement="app"
          primary={
            <Button className={actionBarButton} onClick={() => setPaying(true)}>
              {invoice.totalCents != null ? `Mark paid · ${formatCents(invoice.totalCents)}` : "Mark paid"}
            </Button>
          }
        />
      )}
      {paying && <MarkPaidSheet invoiceId={id} title={invoice.title} totalCents={invoice.totalCents} today={today} onClose={() => setPaying(false)} />}
    </div>
  );
}

/**
 * Under the title once it's Paid: "Paid Nov 24 by Baselane transfer, Connor". A phone drops the partner (History
 * says who) and 320 shortens the method to its first word, so the line never truncates.
 */
function PaidLine({ paid, today }: { paid: NonNullable<InvoiceRecord["paid"]>; today: Ymd }) {
  const day = fmtDay(paid.on, { year: "auto", now: today });
  // Other names no method, as in the Paid email: "Paid Nov 24, Connor".
  const phrase = PAID_BY[paid.method];
  const method = paid.method === "OTHER" ? "" : PAY_METHOD_LABEL[paid.method];
  const by = paid.by ? firstName(paid.by) : null;
  const note = paid.note ? ` · ${paid.note}` : "";
  return (
    <p className="min-w-0 text-body text-fg-2 [grid-area:line]">
      <span className="max-sm:hidden">
        Paid {day}
        {phrase ? ` ${phrase}` : ""}
        {by ? `, ${by}` : ""}
        {note}
      </span>
      <span className="sm:hidden">
        <span className="max-[359px]:hidden">
          Paid {day}
          {method ? `, ${method}` : ""}
        </span>
        <span className="min-[360px]:hidden">
          Paid {day}
          {method ? `, ${method.split(" ")[0]}` : ""}
        </span>
      </span>
    </p>
  );
}
