"use client";
import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import { BackLink } from "@/components/back-link";
import { useToast } from "@/components/toast";
import { useUploadQueue } from "@/components/upload-queue";
import { useRun } from "@/components/use-run";
import { Button, SaveError } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { pickerAccept } from "@/lib/attachments/media";
import { UPLOAD_KIND_ALLOWED } from "@/lib/attachments/upload-kinds";
import type { Ymd } from "@/lib/dates";
import { isDirty, type FieldValues } from "@/lib/invoices/draft";
import { approveBlocker, readTotal } from "@/lib/invoices/fields";
import { cn } from "@/lib/utils";
import { approveInvoiceAction, backToReviewAction } from "../[id]/actions";
import { invoiceUploadTarget } from "../[id]/file-pane";
import { InvoiceFields, UnsavedMark, failureToErrors } from "../[id]/fields";
import type { ContractorChoice, JobChoice } from "../[id]/load";
import { jobRow, useInvoiceDraft, type InvoiceDraft } from "../[id]/use-invoice-draft";
import { createInvoiceAction } from "./actions";

const EMPTY: FieldValues = { contactId: null, invoiceNumber: "", invoiceDate: null, total: "", note: "" };

/**
 * New invoice (docs/contractor-invoices-plan.md, M6 and drawing 12, option A): the invoice page with nothing on it
 * yet. The fields and jobs are a draft, as on any To review invoice (drawing 17, option B), and the bar is Save and
 * Approve. The invoice is made, in To review, when the first file drops or the first Save (or Approve) comes, so the
 * upload has an invoice to belong to; whichever it is, the draft goes into it and the screen carries on to that
 * invoice's page. One you walk away from after a file drop waits in To review, where Not an invoice clears it.
 */
export function NewInvoice({
  contractors,
  jobChoices,
  initialJob,
  today,
}: {
  contractors: ContractorChoice[];
  jobChoices: JobChoice[];
  initialJob: JobChoice | null;
  today: Ymd;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queue = useUploadQueue();
  const run = useRun();
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // The one create: a file dropped while a Save is still going waits for it, so there is only ever one invoice.
  const created = useRef<Promise<ActionResult<{ id: string }>> | null>(null);
  // The job `?job=` names is on the list from the start and isn't an unsaved change.
  const start: InvoiceDraft = { values: EMPTY, jobs: initialJob ? [jobRow(initialJob)] : [] };
  const { draft, baseline, errors, setErrors, edit, addJob, removeJob, validate } = useInvoiceDraft(start, { active: true });
  // Unsaved changes, or the one job it came with: either is worth saving.
  const dirty = isDirty(baseline, draft);
  const saveable = dirty || draft.jobs.length > 0;

  /** Makes the invoice from the draft as it is now. Resolves to its id, or to the refusal. */
  function ensure(): Promise<ActionResult<{ id: string }>> {
    if (!created.current) {
      const v = draft.values;
      const made = callAction(() =>
        createInvoiceAction({
          contactId: v.contactId,
          invoiceNumber: v.invoiceNumber.trim() || null,
          total: v.total.trim() || null,
          note: v.note.trim() || null,
          taskIds: draft.jobs.flatMap((j) => (j.taskId ? [j.taskId] : [])),
        }),
      );
      created.current = made;
      void made.then((res) => {
        if (!res.ok) created.current = null;
      });
    }
    return created.current;
  }

  /** Makes the invoice from the draft, or says why it can't. The id on success. */
  async function make(): Promise<string | null> {
    if (!validate()) return null;
    const made = await ensure();
    if (made.ok) return made.data.id;
    setErrors(failureToErrors(made));
    toast({ message: made.error });
    return null;
  }

  async function save() {
    setSaving(true);
    const id = await make();
    setSaving(false);
    if (!id) return;
    toast({ message: "Saved" });
    router.replace(`/invoices/${id}`);
  }

  /** A file, picked or dropped: make the invoice, queue the file for it and carry on to its page. */
  async function addFiles(files: FileList | File[]) {
    if (files.length === 0) return;
    setProblem(null);
    if (!validate()) return;
    const made = await ensure();
    if (!made.ok) {
      setProblem(made.error);
      return;
    }
    queue.add(invoiceUploadTarget(made.data.id, "Invoice"), files);
    router.replace(`/invoices/${made.data.id}`);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    void addFiles(e.dataTransfer.files);
  }

  const read = readTotal(draft.values.total);
  const blocker = approveBlocker({ contactId: draft.values.contactId, totalCents: read.ok ? read.cents : null });

  async function approve() {
    setSaving(true);
    const id = await make();
    setSaving(false);
    if (!id) return;
    run.run(() => approveInvoiceAction(id), {
      done: "Approved",
      key: `invoice:${id}:stage`,
      undo: () => backToReviewAction(id),
      succeeded: () => router.replace(`/invoices/${id}`),
      // The invoice exists by now, so its page is where the refusal can be dealt with.
      failed: () => router.replace(`/invoices/${id}`),
    });
  }

  return (
    <div className="max-w-300">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/invoices" label="Invoices" />
          <span aria-hidden="true" className="text-meta text-muted-foreground">
            /
          </span>
          <span className="whitespace-nowrap text-meta text-muted-foreground">New</span>
        </div>
        <h1 className="min-w-0 py-1 text-title font-semibold text-foreground [grid-area:title]">New invoice</h1>
      </header>

      <div className="mt-4 grid gap-x-10 gap-y-6 lg:pointer-fine:grid-cols-[minmax(0,1fr)_26.25rem]">
        <div className="min-w-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={(e) => {
              // Crossing into the button or the text isn't leaving the zone.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            }}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-8 text-center lg:pointer-fine:h-[calc(100dvh-var(--app-bar-h)-9rem)]",
              over && "ring-1 ring-inset ring-primary",
            )}
          >
            <input
              ref={picker}
              type="file"
              multiple
              accept={pickerAccept(UPLOAD_KIND_ALLOWED["invoice-upload"])}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="text-body text-fg-2 pointer-coarse:hidden">Drop the invoice here</p>
            <Button type="button" variant="secondary" onClick={() => picker.current?.click()}>
              <span className="pointer-coarse:hidden">or choose a file</span>
              <span className="hidden pointer-coarse:inline">Add the invoice file</span>
            </Button>
            {problem && <SaveError>{problem}</SaveError>}
          </div>
        </div>
        <div className="min-w-0">
          <InvoiceFields
            values={draft.values}
            editable
            contractors={contractors}
            jobChoices={jobChoices}
            jobs={draft.jobs}
            today={today}
            duplicateOf={null}
            needsContractor={false}
            errors={errors}
            onChange={edit}
            onAddJob={addJob}
            onRemoveJob={removeJob}
          />
        </div>
      </div>

      <ActionBar
        placement="app"
        actions={dirty ? <UnsavedMark /> : null}
        secondary={
          <Button variant="secondary" className={actionBarButton} pending={saving} disabled={!saveable || run.pending} onClick={() => void save()}>
            Save
          </Button>
        }
        primary={
          <Button className={actionBarButton} pending={run.pending} disabled={!!blocker || saving} onClick={() => void approve()}>
            Approve
          </Button>
        }
      />
    </div>
  );
}
