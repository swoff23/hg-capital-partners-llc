"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { Switch } from "@/components/switch";
import { FieldRow, FormField, Input } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { fmtDay, type Ymd } from "@/lib/dates";
import { readTerm, rentFromParts } from "@/lib/tenants/fields";
import { addLeaseTerm } from "./actions";

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

const TermSheetContext = createContext<{ open: () => void } | null>(null);

/** Opens the term sheet from the Terms section's Renew and the rail's "Add the signed lease". */
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
  // Each open starts a fresh form, from the defaults as the page has them now.
  const [state, setState] = useState<{ n: number; open: boolean }>({ n: 0, open: false });
  return (
    <TermSheetContext.Provider value={{ open: () => setState((s) => ({ n: s.n + 1, open: true })) }}>
      {children}
      {state.n > 0 && (
        <TermSheet
          key={state.n}
          leaseId={leaseId}
          today={today}
          defaults={defaults}
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

function TermSheet({
  leaseId,
  today,
  defaults,
  isOpen,
  onOpenChange,
}: {
  leaseId: string;
  today: Ymd;
  defaults: TermDefaults;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<Form>({
    startsOn: defaults.startsOn,
    endsOn: "",
    monthly: false,
    tenantPays: defaults.tenantPays,
    subsidy: defaults.subsidy,
    subsidyFrom: defaults.subsidyFrom,
    subsidyContact: defaults.subsidyContact,
    subsidyEmail: defaults.subsidyEmail,
  });
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
    run.run(() => addLeaseTerm(leaseId, input), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: form.monthly ? "Month-to-month term added" : `${defaults.first ? "Term added" : "Renewed"} through ${fmtDay(form.endsOn)}`,
      key: `lease:${leaseId}:term`,
    });
  }

  const errors = { ...run.fieldErrors, ...problems };

  return (
    <FormSheet
      title={defaults.first ? "Add the signed lease" : "Renew"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={defaults.first ? "Save term" : "Save renewal"}
      pending={run.pending}
      values={form}
      discardTitle="Discard this term?"
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
    </FormSheet>
  );
}
