import type { Ymd } from "@/lib/dates";
import { formatCents } from "./email-content";
import { cleanInvoiceNumber, readTotal } from "./fields";

/**
 * The invoice page's draft (drawing 17, option B): in To review the fields and the job list are held in the browser
 * until Save. These are the pure parts, so draft.test.ts runs them without React: what the draft changes compared
 * with what's saved, and the values as they read back after a save. Compared the way the server reads them, so
 * "#1043" over a saved "1043", or a note with a trailing space, is no change.
 */

/** The fields as they read in the inputs. The total is the text as typed ("850.00", "1,043.10", or ""). */
export interface FieldValues {
  contactId: string | null;
  invoiceNumber: string;
  /** Null on New invoice, which dates itself today until someone changes it. */
  invoiceDate: Ymd | null;
  total: string;
  note: string;
}

/** What one save carries per field. A total is the text as typed; the server reads it strictly. */
export type FieldPatch = {
  contactId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Ymd;
  total?: string | null;
  note?: string | null;
};

/** A job on the invoice. `linkId` is the link's own id, so a job since deleted still reads as its title. */
export interface DraftJob {
  linkId: string;
  taskId: string | null;
}

export type JobRef = { taskId: string } | { linkId: string };

/** Everything one Save writes: the changed fields, the jobs to put on and the jobs to take off. */
export interface InvoiceChanges {
  patch: FieldPatch;
  link: string[];
  unlink: JobRef[];
}

export interface Draft<J extends DraftJob = DraftJob> {
  values: FieldValues;
  jobs: J[];
}

/** Cents as the total field reads: 85050 is "850.50", null is "". */
export const totalText = (cents: number | null): string => (cents == null ? "" : formatCents(cents).slice(1));

/** A job's identity across a save: the job itself, or the link for a job since deleted. Link ids change when a link is made. */
const jobKey = (j: DraftJob): string => (j.taskId ? `t:${j.taskId}` : `l:${j.linkId}`);

/** What the draft changes compared with `saved`, or null when it changes nothing. */
export function draftChanges(saved: Draft, draft: Draft): InvoiceChanges | null {
  const s = saved.values;
  const d = draft.values;
  const patch: FieldPatch = {};
  if (d.contactId !== s.contactId) patch.contactId = d.contactId;
  if (cleanInvoiceNumber(d.invoiceNumber) !== cleanInvoiceNumber(s.invoiceNumber)) patch.invoiceNumber = d.invoiceNumber.trim() || null;
  if (d.invoiceDate && d.invoiceDate !== s.invoiceDate) patch.invoiceDate = d.invoiceDate;
  const dt = readTotal(d.total);
  const st = readTotal(s.total);
  // A total that can't be read counts as a change, so Save speaks up about it instead of sitting quiet.
  if (!dt.ok || !st.ok || dt.cents !== st.cents) patch.total = d.total.trim() || null;
  if (d.note.trim() !== s.note.trim()) patch.note = d.note.trim() || null;

  const had = new Set(saved.jobs.map(jobKey));
  const has = new Set(draft.jobs.map(jobKey));
  const link = draft.jobs.flatMap((j) => (j.taskId && !had.has(jobKey(j)) ? [j.taskId] : []));
  const unlink = saved.jobs.flatMap<JobRef>((j) => (has.has(jobKey(j)) ? [] : [j.taskId ? { taskId: j.taskId } : { linkId: j.linkId }]));

  if (Object.keys(patch).length === 0 && link.length === 0 && unlink.length === 0) return null;
  return { patch, link, unlink };
}

export const isDirty = (saved: Draft, draft: Draft): boolean => draftChanges(saved, draft) !== null;

/** The values as the page reads them back once they're saved: the number without its "#", the total as dollars, the note trimmed. */
export function savedValues(v: FieldValues): FieldValues {
  const read = readTotal(v.total);
  return {
    ...v,
    invoiceNumber: cleanInvoiceNumber(v.invoiceNumber) ?? "",
    total: read.ok ? totalText(read.cents) : v.total,
    note: v.note.trim(),
  };
}
