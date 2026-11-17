"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { Switch } from "@/components/switch";
import { Button, FieldRow, FormField, Input } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { fmtDay, type Ymd } from "@/lib/dates";
import { readTerm, rentFromParts, tenantShare } from "@/lib/tenants/fields";
import { addLeaseTerm, deleteLeaseTerm, restoreLeaseTerm, saveLeaseTerm } from "./actions";

/**
 * What the new term starts from: the day after the last one ends, with what
 * the tenant paid, the housing authority's share, who paid it and their contact, so a
 * renewal on the same terms keeps the same rent. Blank when there's no term yet.
 */
export type TermDefaults = {
  startsOn: Ymd | "";
  tenantPays: string;
  subsidy: string;
  subsidyFrom: string;
  subsidyContact: string;
  subsidyEmail: string;
  first: boolean;
};

/** A term as the edit sheet opens it (docs/specs/lease-term-edits.md): its dates, the whole rent and the share. */
export type EditTerm = {
  id: string;
  startsOn: Ymd;
  endsOn: Ymd | null;
  rent: number;
  subsidy: number | null;
  subsidyFrom: string | null;
  subsidyContact: string | null;
  subsidyEmail: string | null;
};

/** "Oct 1, 2025 to Dec 10, 2025", or "Oct 1, 2025, month to month": a term row's dates and the edit sheet's title. */
export function termDates(t: { startsOn: Ymd; endsOn: Ymd | null }): string {
  return t.endsOn ? `${fmtDay(t.startsOn)} to ${fmtDay(t.endsOn)}` : `${fmtDay(t.startsOn)}, month to month`;
}

/** The delete toast: "Oct 1 to Dec 10, 2025 term deleted", the start's year only when it differs from the end's. */
function deletedLine(t: { startsOn: Ymd; endsOn: Ymd | null }): string {
  if (!t.endsOn) return `Month-to-month term from ${fmtDay(t.startsOn)} deleted`;
  return `${fmtDay(t.startsOn, { year: "auto", now: t.endsOn })} to ${fmtDay(t.endsOn)} term deleted`;
}

const TermSheetContext = createContext<{ open: () => void; edit: (term: EditTerm) => void } | null>(null);

/**
 * Opens the term sheet: `open` from the Terms section's Renew and the rail's
 * "Add the signed lease", `edit` from a term row.
 */
export function useTermSheet() {
  const ctx = useContext(TermSheetContext);
  if (!ctx) throw new Error("useTermSheet needs a TermSheetProvider above it.");
  return ctx;
}

export function TermSheetProvider({
  leaseId,
  today,
  defaults,
  children,
}: {
  leaseId: string;
  today: Ymd;
  defaults: TermDefaults;
  children: ReactNode;
}) {
  // Each open starts a fresh form, from the defaults or the term as the page has them now.
  const [state, setState] = useState<{ n: number; open: boolean; term: EditTerm | null }>({ n: 0, open: false, term: null });
  const value = {
    open: () => setState((s) => ({ n: s.n + 1, open: true, term: null })),
    edit: (term: EditTerm) => setState((s) => ({ n: s.n + 1, open: true, term })),
  };
  return (
    <TermSheetContext.Provider value={value}>
      {children}
      {state.n > 0 && (
        <TermSheet
          key={state.n}
          leaseId={leaseId}
          today={today}
          defaults={defaults}
          term={state.term}
          isOpen={state.open}
          onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        />
      )}
    </TermSheetContext.Provider>
  );
}

type Form = {
  startsOn: string;
  endsOn: string;
  monthly: boolean;
  tenantPays: string;
  subsidy: string;
  subsidyFrom: string;
  subsidyContact: string;
  subsidyEmail: string;
};

/** The form a term opens with: its own values when editing, else the next term's defaults. */
function startingForm(defaults: TermDefaults, term: EditTerm | null): Form {
  if (term) {
    return {
      startsOn: term.startsOn,
      endsOn: term.endsOn ?? "",
      monthly: term.endsOn === null,
      tenantPays: String(tenantShare(term.rent, term.subsidy)),
      subsidy: term.subsidy ? String(term.subsidy) : "",
      subsidyFrom: term.subsidyFrom ?? "",
      subsidyContact: term.subsidyContact ?? "",
      subsidyEmail: term.subsidyEmail ?? "",
    };
  }
  return {
    startsOn: defaults.startsOn,
    endsOn: "",
    monthly: false,
    tenantPays: defaults.tenantPays,
    subsidy: defaults.subsidy,
    subsidyFrom: defaults.subsidyFrom,
    subsidyContact: defaults.subsidyContact,
    subsidyEmail: defaults.subsidyEmail,
  };
}

/**
 * The term sheet. With no `term` it adds one: the first, or a renewal. With
 * one it edits that term, any term on the lease, with Delete term under the
 * fields as the tenant sheet has Remove from lease (docs/specs/lease-term-edits.md).
 */
function TermSheet({
  leaseId,
  today,
  defaults,
  term,
  isOpen,
  onOpenChange,
}: {
  leaseId: string;
  today: Ymd;
  defaults: TermDefaults;
  term: EditTerm | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [initial] = useState<Form>(() => startingForm(defaults, term));
  const [form, setForm] = useState<Form>(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const run = useRun();
  const set = (patch: Partial<Form>) => {
    if (run.error) run.reset();
    setForm((f) => ({ ...f, ...patch }));
    // A line clears as its field is edited.
    setProblems((p) => {
      const next = { ...p };
      for (const k of Object.keys(patch)) delete next[k === "monthly" ? "endsOn" : k];
      return next;
    });
  };
  const hasShare = form.subsidy.trim() !== "";

  function submit() {
    // The form asks for the two parts; the term keeps the whole rent, their sum (Connor, Nov 14).
    const parts = rentFromParts(form.tenantPays, form.subsidy);
    const input = {
      startsOn: form.startsOn,
      endsOn: form.monthly ? "" : form.endsOn,
      rent: parts.ok ? parts.data.rent : "",
      subsidy: form.subsidy,
      subsidyFrom: form.subsidyFrom,
      subsidyContact: form.subsidyContact,
      subsidyEmail: form.subsidyEmail,
    };
    const read = readTerm(input);
    const { rent: rentLine, ...termLines } = read.ok ? {} : read.problems;
    const found: Record<string, string> = { ...termLines, ...(parts.ok ? (rentLine ? { tenantPays: rentLine } : {}) : parts.problems) };
    if (!form.monthly && !form.endsOn && !found.endsOn) found.endsOn = "Enter when the lease ends, or choose Month to month.";
    if (Object.keys(found).length) {
      setProblems(found);
      return;
    }
    if (term) {
      // Nothing changed: close without a save, as the tenant sheet does.
      if ((Object.keys(form) as (keyof Form)[]).every((k) => form[k] === initial[k])) {
        onOpenChange(false);
        return;
      }
      run.run(() => saveLeaseTerm(leaseId, term.id, input), {
        failure: "inline",
        succeeded: () => onOpenChange(false),
        done: "Term saved",
        key: `lease:${leaseId}:term`,
      });
      return;
    }
    run.run(() => addLeaseTerm(leaseId, input), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: form.monthly ? "Month-to-month term added" : `${defaults.first ? "Term added" : "Renewed"} through ${fmtDay(form.endsOn)}`,
      key: `lease:${leaseId}:term`,
    });
  }

  function remove() {
    if (!term) return;
    // Undo puts back what the delete returned: the server's copy, its signed lease included. The toast
    // offers Undo only after a success, so the snapshot is set by then.
    let snapshot: Parameters<typeof restoreLeaseTerm>[1] | null = null;
    run.run(() => deleteLeaseTerm(leaseId, term.id), {
      failure: "inline",
      succeeded: (data) => {
        snapshot = data;
        onOpenChange(false);
      },
      done: deletedLine(term),
      key: `lease:${leaseId}:term`,
      undo: () => restoreLeaseTerm(leaseId, snapshot!),
    });
  }

  const errors = { ...run.fieldErrors, ...problems };

  return (
    <FormSheet
      title={term ? termDates(term) : defaults.first ? "Add the signed lease" : "Renew"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={term || defaults.first ? "Save term" : "Save renewal"}
      pending={run.pending}
      values={form}
      discardTitle={term ? "Discard changes to this term?" : "Discard this term?"}
      leaveTitle="Leave without saving this term?"
      error={run.error}
      fieldErrors={errors}
    >
      <FieldRow>
        <FormField label="Starts" error={errors.startsOn}>
          {() => (
            <DatePicker variant="field" label="Starts" today={today} allowNone={false} value={form.startsOn || null} onChange={(v) => set({ startsOn: v ?? "" })} />
          )}
        </FormField>
        {!form.monthly && (
          <FormField label="Ends" error={errors.endsOn}>
            {() => <DatePicker variant="field" label="Ends" today={today} value={form.endsOn || null} onChange={(v) => set({ endsOn: v ?? "" })} />}
          </FormField>
        )}
      </FieldRow>
      <Switch label="Month to month" isSelected={form.monthly} onChange={(monthly) => set({ monthly })} />
      {/* No "Saves as" line under the amounts (Connor, Nov 14). */}
      <FormField label="Tenant pays" error={errors.tenantPays ?? errors.rent}>
        {(p) => <NumberInput kind="money" {...p} value={form.tenantPays} onChange={(tenantPays) => set({ tenantPays })} />}
      </FormField>
      <FormField
        label="Housing authority pays"
        optional
        error={errors.subsidy ?? (form.subsidy ? numberProblem("money", form.subsidy) ?? undefined : undefined)}
      >
        {(p) => <NumberInput kind="money" {...p} value={form.subsidy} onChange={(subsidy) => set({ subsidy })} />}
      </FormField>
      {hasShare && (
        <>
          <FormField label="Who pays" optional error={errors.subsidyFrom}>
            {(p) => (
              <Input
                {...p}
                name="subsidyFrom"
                autoComplete="off"
                value={form.subsidyFrom}
                onChange={(e) => set({ subsidyFrom: e.target.value })}
              />
            )}
          </FormField>
          {/* The housing authority's contact, the Section 8 caseworker (Connor, Nov 14). */}
          <FieldRow>
            <FormField label="Contact name" optional error={errors.subsidyContact}>
              {(p) => (
                <Input
                  {...p}
                  name="subsidyContact"
                  autoComplete="off"
                  value={form.subsidyContact}
                  onChange={(e) => set({ subsidyContact: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Contact email" optional error={errors.subsidyEmail}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  name="subsidyEmail"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.subsidyEmail}
                  onChange={(e) => set({ subsidyEmail: e.target.value })}
                />
              )}
            </FormField>
          </FieldRow>
        </>
      )}
      {term && (
        <div>
          <Button type="button" variant="danger" size="sm" disabled={run.pending} onClick={remove}>
            Delete term
          </Button>
        </div>
      )}
    </FormSheet>
  );
}
