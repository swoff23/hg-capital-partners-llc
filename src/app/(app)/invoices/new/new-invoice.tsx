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
import { approveBlocker, cleanInvoiceNumber, readTotal } from "@/lib/invoices/fields";
import { cn } from "@/lib/utils";
import { approveInvoiceAction, backToReviewAction, linkJobAction, saveInvoiceFieldsAction, unlinkJobAction } from "../[id]/actions";
import { invoiceUploadTarget } from "../[id]/file-pane";
import { InvoiceFields, failureToResult, totalText, useSaveFlush, type FieldPatch, type FieldValues, type JobRow, type SaveResult } from "../[id]/fields";
import type { ContractorChoice, JobChoice } from "../[id]/load";
import { createInvoiceAction } from "./actions";

const EMPTY: FieldValues = { contactId: null, invoiceNumber: "", invoiceDate: null, total: "", note: "" };

/** The values after a save of `patch`, as the fields read them back: the number without its "#", the total as dollars. */
function applied(v: FieldValues, patch: FieldPatch): FieldValues {
  const next = { ...v };
  if (patch.contactId !== undefined) next.contactId = patch.contactId;
  if (patch.invoiceNumber !== undefined) next.invoiceNumber = cleanInvoiceNumber(patch.invoiceNumber) ?? "";
  if (patch.total !== undefined) {
    const read = readTotal(patch.total);
    next.total = read.ok ? totalText(read.cents) : v.total;
  }
  if (patch.note !== undefined) next.note = patch.note ?? "";
  return next;
}

const jobRow = (j: JobChoice): JobRow => ({ linkId: j.id, taskId: j.id, title: j.title, address: j.address, status: j.status });

/**
 * New invoice (docs/contractor-invoices-plan.md, M6 and drawing 12, option A): the invoice page with nothing on it
 * yet. The invoice is made, in To review, when the first file drops or the first field saves, so the upload has
 * an invoice to belong to; from then on every field saves as you leave it, as on any invoice, and Approve moves it to
 * To pay. A dropped file makes the invoice and carries on to its page, where the file shows as it goes up. One you
 * walk away from waits in To review, where Not an invoice clears it.
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
  const [values, setValues] = useState<FieldValues>(EMPTY);
  const valuesRef = useRef(values);
  const [jobs, setJobsState] = useState<JobRow[]>(initialJob ? [jobRow(initialJob)] : []);
  const jobsRef = useRef(jobs);
  const [saved, setSaved] = useState(false);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { track, flush } = useSaveFlush();
  // The total as typed, so Approve follows the text and not the last save.
  const [draftTotal, setDraftTotal] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // The one create: a second field left while it's still going waits for it, so there is only ever one invoice.
  const created = useRef<Promise<ActionResult<{ id: string }>> | null>(null);

  const setBoth = (v: FieldValues) => {
    valuesRef.current = v;
    setValues(v);
  };
  const setJobs = (j: JobRow[]) => {
    jobsRef.current = j;
    setJobsState(j);
  };

  /** Makes the invoice from what's saved so far plus `patch`. Resolves to its id, or to the refusal. */
  async function ensure(patch: FieldPatch): Promise<ActionResult<{ id: string }>> {
    if (!created.current) {
      const v = valuesRef.current;
      created.current = callAction(() =>
        createInvoiceAction({
          contactId: patch.contactId !== undefined ? patch.contactId : v.contactId,
          invoiceNumber: patch.invoiceNumber !== undefined ? patch.invoiceNumber : v.invoiceNumber || null,
          total: patch.total !== undefined ? patch.total : v.total || null,
          note: patch.note !== undefined ? patch.note : v.note || null,
          taskIds: jobsRef.current.flatMap((j) => (j.taskId ? [j.taskId] : [])),
        }),
      );
      const res = await created.current;
      // The address stays /invoices/new while this is the editor: a later save refreshes the page at its address, and
      // an address that named the invoice would swap this screen for the invoice page under the person's typing.
      if (res.ok) setBoth(applied(v, patch));
      else created.current = null;
      return res;
    }
    return created.current;
  }

  function save(patch: FieldPatch): Promise<SaveResult> {
    return track(saveNow(patch));
  }

  async function saveNow(patch: FieldPatch): Promise<SaveResult> {
    setSaved(false);
    const first = !created.current;
    const made = await ensure(patch);
    if (!made.ok) return failureToResult(made);
    if (first) {
      setSaved(true);
      return { ok: true };
    }
    const res = await callAction(() => saveInvoiceFieldsAction(made.data.id, patch));
    if (res.ok) {
      setBoth(applied(valuesRef.current, patch));
      setSaved(true);
      return { ok: true };
    }
    const lost = res.fieldErrors?.stage;
    if (lost) {
      toast({ message: lost });
      return { ok: false, errors: {} };
    }
    return failureToResult(res);
  }

  function addJob(job: JobChoice) {
    const row = jobRow(job);
    setJobs([...jobsRef.current, row]);
    if (created.current)
      void created.current.then((made) => {
        // A refused link leaves nothing on the invoice, so the row comes back off.
        if (made.ok)
          run.run(() => linkJobAction(made.data.id, job.id), {
            failed: () => setJobs(jobsRef.current.filter((j) => j.linkId !== row.linkId)),
          });
      });
  }

  function removeJob(job: JobRow) {
    setJobs(jobsRef.current.filter((j) => j.linkId !== job.linkId));
    if (created.current && job.taskId) {
      const taskId = job.taskId;
      void created.current.then((made) => {
        // A refused unlink leaves the job on the invoice, so its row comes back.
        if (made.ok)
          run.run(() => unlinkJobAction(made.data.id, { taskId }), {
            failed: () => {
              if (!jobsRef.current.some((j) => j.linkId === job.linkId)) setJobs([...jobsRef.current, job]);
            },
          });
      });
    }
  }

  /** A file, picked or dropped: make the invoice, queue the file for it and carry on to its page. */
  async function addFiles(files: FileList | File[]) {
    if (files.length === 0) return;
    setProblem(null);
    const made = await ensure({});
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

  const read = readTotal(draftTotal ?? values.total);
  const blocker = approveBlocker({ contactId: values.contactId, totalCents: read.ok ? read.cents : null });

  async function approve() {
    await flush();
    const made = await ensure({});
    if (!made.ok) {
      toast({ message: made.error });
      return;
    }
    const id = made.data.id;
    run.run(() => approveInvoiceAction(id), {
      done: "Approved",
      key: `invoice:${id}:stage`,
      undo: () => backToReviewAction(id),
      succeeded: () => router.replace(`/invoices/${id}`),
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
            values={values}
            editable
            contractors={contractors}
            jobChoices={jobChoices}
            jobs={jobs}
            today={today}
            duplicateOf={null}
            needsContractor={false}
            save={save}
            onAddJob={addJob}
            onRemoveJob={removeJob}
            saved={saved}
            onTotalDraft={setDraftTotal}
          />
        </div>
      </div>

      <ActionBar
        placement="app"
        primary={
          <Button className={actionBarButton} pending={run.pending} disabled={!!blocker} onClick={approve}>
            Approve
          </Button>
        }
      />
    </div>
  );
}
