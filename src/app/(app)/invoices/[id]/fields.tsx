"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleHelp, Plus, TriangleAlert, X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { DatePicker } from "@/components/due-date-picker";
import { OptionList, type OptionItem } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { Select } from "@/components/select";
import { WarnMark } from "@/components/source-line";
import { StatusMark } from "@/components/status-badge";
import { Button, Input, SaveError, Textarea, addRowClass } from "@/components/ui";
import { formatCents } from "@/lib/invoices/email-content";
import type { FieldValues } from "@/lib/invoices/draft";
import { readTotal } from "@/lib/invoices/fields";
import { fmtDay, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";
import type { ContractorChoice, JobChoice } from "./load";

/**
 * An invoice's fields (docs/contractor-invoices-plan.md, section 6, item 2 and 6.1 item 4): contractor, invoice
 * number, date, total, jobs and the note only staff see. In To review they are a draft the page holds until Save
 * (drawing 17, option B): this draws `values` and `jobs` and reports each edit through `onChange`, `onAddJob` and
 * `onRemoveJob`; after Approve they read as text, and Back to review reopens them. The page and New invoice share it.
 */

export type FieldErrors = Record<string, string>;

/** A refused save as the fields show it: a line on the field it names, or one under the fields for anything else. */
export function failureToErrors(f: { error: string; fieldErrors?: FieldErrors }): FieldErrors {
  const known = Object.fromEntries(Object.entries(f.fieldErrors ?? {}).filter(([k]) => FIELD_KEYS.includes(k)));
  return Object.keys(known).length > 0 ? known : { form: f.error };
}

const FIELD_KEYS = ["contactId", "invoiceNumber", "invoiceDate", "total", "note"];

/** On the bar while the draft differs from what's saved; a phone's bar is the two buttons alone. */
export function UnsavedMark() {
  return <span className="hidden whitespace-nowrap text-body text-warn lg:inline">Unsaved changes</span>;
}

/** A job on the invoice. `linkId` is the link's own id, so a job since deleted still reads as its title. */
export interface JobRow {
  linkId: string;
  taskId: string | null;
  title: string;
  address: string | null;
  status: TaskStatus | null;
}

/** The label row: the label at the start and, at the end, a flag that belongs to the field. */
function LabelRow({ htmlFor, label, optional, flag }: { htmlFor?: string; label: string; optional?: boolean; flag?: ReactNode }) {
  return (
    <div className="flex min-h-5 items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-meta font-medium text-fg-2">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      {flag}
    </div>
  );
}


/** A read-only value under its label, as the rail draws a fact. */
function ReadValue({ label, flag, children }: { label: string; flag?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <LabelRow label={label} flag={flag} />
      <div className="min-w-0 break-words text-body text-foreground [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

const dash = <span className="text-muted-foreground">—</span>;

export function InvoiceFields({
  values,
  editable,
  contractors,
  jobChoices,
  jobs,
  today,
  duplicateOf,
  needsContractor,
  errors,
  onChange,
  onAddJob,
  onRemoveJob,
}: {
  values: FieldValues;
  editable: boolean;
  contractors: ContractorChoice[];
  jobChoices: JobChoice[];
  jobs: JobRow[];
  today: Ymd;
  /** The older invoice this one may repeat (M10); stays in every stage. */
  duplicateOf: { id: string; title: string } | null;
  /** "Who's this from?" (M11): an emailed invoice with no contractor yet. */
  needsContractor: boolean;
  /** The line each field shows, by field name; `form` is the one under the fields for a refusal no field owns. */
  errors: FieldErrors;
  /** One edit, as the draft's new value for that field. */
  onChange: (patch: Partial<FieldValues>) => void;
  onAddJob: (job: JobChoice) => void;
  onRemoveJob: (job: JobRow) => void;
}) {
  const numberId = useId();
  const totalId = useId();
  const noteId = useId();

  const picked = contractors.find((c) => c.id === values.contactId);
  const items: OptionItem[] = contractors.map((c) => ({
    id: c.id,
    label: c.name,
    description: c.company ?? undefined,
    searchText: [c.company, c.email].filter(Boolean).join(" "),
    ...(c.active ? {} : { tag: "Inactive" }),
  }));
  const flagForContractor =
    needsContractor && !values.contactId ? (
      <WarnMark icon={CircleHelp} className="shrink-0 whitespace-nowrap text-meta">
        Who&apos;s this from?
      </WarnMark>
    ) : null;
  const flagForNumber = duplicateOf ? (
    <Link href={`/invoices/${duplicateOf.id}`} aria-label={`Possible duplicate of ${duplicateOf.title}`} className="relative underline-offset-3 hover:underline pointer-coarse:after:absolute pointer-coarse:after:-inset-3">
      <WarnMark icon={TriangleAlert} className="shrink-0 whitespace-nowrap text-meta">
        Possible duplicate
      </WarnMark>
    </Link>
  ) : null;

  const jobsBlock = (
    <JobsBlock editable={editable} jobs={jobs} choices={jobChoices} onAdd={onAddJob} onRemove={onRemoveJob} />
  );

  if (!editable) {
    const cents = readTotal(values.total);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:pointer-fine:grid-cols-1">
          <ReadValue label="Contractor" flag={flagForContractor}>
            {picked?.name ?? dash}
          </ReadValue>
          <ReadValue label="Invoice #" flag={flagForNumber}>
            {values.invoiceNumber || dash}
          </ReadValue>
        </div>
        <div className="grid grid-cols-2 gap-4 max-[359px]:grid-cols-1">
          <ReadValue label="Invoice date">{values.invoiceDate ? fmtDay(values.invoiceDate, { year: "always" }) : dash}</ReadValue>
          <ReadValue label="Total">{cents.ok && cents.cents != null ? formatCents(cents.cents) : dash}</ReadValue>
        </div>
        {jobsBlock}
        <ReadValue label="Internal note">{values.note ? <span className="whitespace-pre-wrap">{values.note}</span> : dash}</ReadValue>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:pointer-fine:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <LabelRow label="Contractor" flag={flagForContractor} />
          <Select
            aria-label="Contractor"
            items={items}
            value={values.contactId ?? null}
            emptyLabel="No contractor"
            searchLabel="Search contractors"
            emptyText="No contractor matches."
            title="Contractor"
            placeholder="Pick a contractor"
            isInvalid={!!errors.contactId}
            errorMessage={errors.contactId || undefined}
            onChange={(next) => onChange({ contactId: next })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <LabelRow htmlFor={numberId} label="Invoice #" optional flag={flagForNumber} />
          <Input
            id={numberId}
            value={values.invoiceNumber}
            maxLength={200}
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={errors.invoiceNumber ? true : undefined}
            onChange={(e) => onChange({ invoiceNumber: e.target.value })}
          />
          {errors.invoiceNumber && <p className="truncate text-meta text-destructive">{errors.invoiceNumber}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-[359px]:grid-cols-1">
        {values.invoiceDate && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <LabelRow label="Invoice date" />
            <DatePicker
              variant="field"
              label="Invoice date"
              today={today}
              allowNone={false}
              value={values.invoiceDate}
              onChange={(next) => {
                if (next) onChange({ invoiceDate: next });
              }}
            />
            {errors.invoiceDate && <p className="truncate text-meta text-destructive">{errors.invoiceDate}</p>}
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col gap-1.5", !values.invoiceDate && "col-span-2 max-[359px]:col-span-1")}>
          <LabelRow htmlFor={totalId} label="Total" />
          <Input
            id={totalId}
            prefix="$"
            value={values.total}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={errors.total ? true : undefined}
            onChange={(e) => onChange({ total: e.target.value })}
          />
          {errors.total && <p className="truncate text-meta text-destructive">{errors.total}</p>}
        </div>
      </div>

      {jobsBlock}

      <div className="flex min-w-0 flex-col gap-1.5">
        <LabelRow htmlFor={noteId} label="Internal note" optional />
        <Textarea
          id={noteId}
          value={values.note}
          rows={3}
          maxLength={2000}
          className="min-h-20 resize-y"
          onChange={(e) => onChange({ note: e.target.value })}
        />
        {errors.note && <p className="truncate text-meta text-destructive">{errors.note}</p>}
      </div>

      {errors.form && <SaveError>{errors.form}</SaveError>}
    </div>
  );
}

/** The jobs on the invoice, each opening its task, and in To review the Add job picker and a Remove on each. */
function JobsBlock({
  editable,
  jobs,
  choices,
  onAdd,
  onRemove,
}: {
  editable: boolean;
  jobs: JobRow[];
  choices: JobChoice[];
  onAdd: (job: JobChoice) => void;
  onRemove: (job: JobRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = new Set(jobs.flatMap((j) => (j.taskId ? [j.taskId] : [])));
  const items: OptionItem[] = choices
    .filter((c) => !on.has(c.id))
    .map((c) => ({
      id: c.id,
      label: c.title,
      description: c.address ?? undefined,
      searchText: c.address ?? "",
      leading: <StatusMark status={c.status} />,
    }));

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-meta font-medium text-fg-2">Jobs</span>
      {jobs.length === 0 && !editable && dash}
      {jobs.length > 0 && (
        <ul className="divide-y divide-border">
          {jobs.map((j) => {
            const words = j.address ? `${j.title} · ${j.address}` : j.title;
            return (
              <li key={j.linkId} className="flex min-h-10 items-center gap-2 py-1 pointer-coarse:min-h-12">
                {j.taskId ? (
                  <Link href={`/tasks/${j.taskId}`} className="min-w-0 flex-1 truncate text-body text-foreground underline-offset-3 hover:underline">
                    {words}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-body text-muted-foreground">{words}</span>
                )}
                {editable && (
                  <Button type="button" variant="ghost" size="sm" icon aria-label={`Take off ${j.title}`} onClick={() => onRemove(j)}>
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <PickerLayer
          isOpen={open}
          onOpenChange={setOpen}
          title="Add job"
          popoverClassName="min-w-64 max-w-80"
          trigger={
            <AriaButton className={cn(addRowClass, jobs.length === 0 && "border-t-0", "px-0")}>
              <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-muted-foreground" />
              Add job
            </AriaButton>
          }
        >
          {({ container, close }) => (
            <OptionList
              aria-label="Jobs"
              container={container}
              items={items}
              selectedKey={null}
              search
              searchLabel="Search jobs"
              emptyText="No job matches."
              onTab={close}
              onPick={(id) => {
                close();
                const job = choices.find((c) => c.id === id);
                if (job) onAdd(job);
              }}
            />
          )}
        </PickerLayer>
      )}
    </div>
  );
}
