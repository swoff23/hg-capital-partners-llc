"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberHelper, numberProblem } from "@/components/number-input";
import { Switch } from "@/components/switch";
import { FieldRow, FormField, Input } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { fmtDay, type Ymd } from "@/lib/dates";
import { readTerm } from "@/lib/tenants/fields";
import { addLeaseTerm } from "./actions";

/**
 * What the new term starts from: the day after the last one ends, with its
 * rent and who pays the housing authority's share. Blank when there's no
 * term yet.
 */
export type TermDefaults = { startsOn: Ymd | ""; rent: string; subsidyFrom: string; first: boolean };

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

type Form = { startsOn: string; endsOn: string; monthly: boolean; rent: string; subsidy: string; subsidyFrom: string };

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
    rent: defaults.rent,
    subsidy: "",
    subsidyFrom: defaults.subsidyFrom,
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
    const input = {
      startsOn: form.startsOn,
      endsOn: form.monthly ? "" : form.endsOn,
      rent: form.rent,
      subsidy: form.subsidy,
      subsidyFrom: form.subsidyFrom,
    };
    const read = readTerm(input);
    const found: Record<string, string> = read.ok ? {} : { ...read.problems };
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
      <FormField label="Rent" helper={numberHelper("money", form.rent, { fallback: "The whole monthly rent" })} error={errors.rent}>
        {(p) => <NumberInput kind="money" {...p} value={form.rent} onChange={(rent) => set({ rent })} />}
      </FormField>
      <FormField
        label="Housing authority pays"
        optional
        helper={numberHelper("money", form.subsidy)}
        error={errors.subsidy ?? (form.subsidy ? numberProblem("money", form.subsidy) ?? undefined : undefined)}
      >
        {(p) => <NumberInput kind="money" {...p} value={form.subsidy} onChange={(subsidy) => set({ subsidy })} />}
      </FormField>
      {hasShare && (
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
      )}
    </FormSheet>
  );
}
