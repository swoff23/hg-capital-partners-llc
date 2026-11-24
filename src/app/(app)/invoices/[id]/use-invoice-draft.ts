"use client";
import { useState } from "react";
import { useHoldLeave } from "@/components/leave-guard";
import { useLeaveWarning } from "@/components/use-leave-warning";
import { isDirty, savedValues, type Draft, type FieldValues } from "@/lib/invoices/draft";
import { readTotal } from "@/lib/invoices/fields";
import type { FieldErrors, JobRow } from "./fields";
import type { JobChoice } from "./load";

export type InvoiceDraft = Draft<JobRow>;

/** The row a picked job makes on the draft: its link is made at Save, so until then the row is named by the job. */
export const jobRow = (j: JobChoice): JobRow => ({ linkId: j.id, taskId: j.id, title: j.title, address: j.address, status: j.status });

/**
 * The invoice page's draft (drawing 17, option B), for the page and New invoice. In To review the fields and jobs are
 * held here and nothing is written until Save. `saved` is what the server has: when it changes under a clean draft
 * (a save landing, another partner's edit) the draft follows it, and under an unsaved one the draft stays and is
 * compared with the new `saved`. `resetKey` starts the draft over (the invoice moved stage). While `active` and
 * dirty it holds the LeaveGuard (in-app links, Back) and asks the browser before a reload or a closed tab.
 */
export function useInvoiceDraft(saved: InvoiceDraft, { active, resetKey = "" }: { active: boolean; resetKey?: string }) {
  const [baseline, setBaseline] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<FieldErrors>({});
  const json = JSON.stringify(saved);
  const [seen, setSeen] = useState({ resetKey, json });
  if (resetKey !== seen.resetKey || json !== seen.json) {
    const moved = resetKey !== seen.resetKey;
    setSeen({ resetKey, json });
    if (moved || !isDirty(baseline, draft)) {
      setDraft(saved);
      setErrors({});
    }
    setBaseline(saved);
  }

  const dirty = active && isDirty(baseline, draft);
  useHoldLeave(dirty ? { title: "Leave without saving?", stay: "Keep editing" } : null);
  useLeaveWarning(dirty, { guarded: true });

  function edit(patch: Partial<FieldValues>) {
    setDraft((d) => ({ ...d, values: { ...d.values, ...patch } }));
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])), form: "" }));
  }

  function addJob(job: JobChoice) {
    setDraft((d) => (d.jobs.some((j) => j.taskId === job.id) ? d : { ...d, jobs: [...d.jobs, jobRow(job)] }));
  }

  function removeJob(row: JobRow) {
    setDraft((d) => ({ ...d, jobs: d.jobs.filter((j) => j.linkId !== row.linkId) }));
  }

  /** A total that can't be read is said on the field before anything is sent. True when it's fine. */
  function validate(): boolean {
    const read = readTotal(draft.values.total);
    if (read.ok) return true;
    setErrors({ total: read.message });
    return false;
  }

  /** `sent` is now what the server has: it becomes the baseline, and the draft too unless it moved on since. */
  function commit(sent: InvoiceDraft) {
    const next: InvoiceDraft = { values: savedValues(sent.values), jobs: sent.jobs };
    setBaseline(next);
    setDraft((cur) => (cur === sent ? next : cur));
    setErrors({});
  }

  return { draft, baseline, dirty, errors, setErrors, edit, addJob, removeJob, validate, commit };
}
