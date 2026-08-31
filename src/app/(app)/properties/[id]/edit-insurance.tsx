"use client";
import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { cn, fmtDate, fmtMoney, relativeDays } from "@/lib/utils";
import { patchProperty } from "../actions";
import { SectionCard } from "./edit-details";

export type EditableInsurance = {
  id: string;
  version: string;
  insuranceCarrier: string | null;
  insurancePolicyNo: string | null;
  insurancePremium: string | null;
  insuranceRenewalDate: string | null;
  replacementCost: string | null;
};

/** Label + value — same label style as the other cards' `Field`, but grid-friendly. */
const R = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className="mt-0.5 text-sm">{children}</div>
  </div>
);

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

export function PropertyInsuranceSection({ insurance: p }: { insurance: EditableInsurance }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = patchProperty.bind(null, p.id);
  const formId = `property-insurance-${p.id}`;

  const renewal = p.insuranceRenewalDate;
  const overdue = !!renewal && new Date(renewal) < new Date();

  if (!editing) {
    return (
      <SectionCard title="Insurance" onEdit={() => setEditing(true)}>
        {renewal && (
          <div className="mb-3 rounded-lg border border-border bg-background px-3 py-2">
            <div className="text-xs text-muted">Renewal</div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{fmtDate(renewal)}</span>
              <span
                className={cn(
                  "text-xs",
                  overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted",
                )}
              >
                {relativeDays(renewal)}
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <R label="Carrier">{p.insuranceCarrier ?? "—"}</R>
          <R label="Policy #">{p.insurancePolicyNo ?? "—"}</R>
          <R label="Premium">{fmtMoney(p.insurancePremium)}</R>
          <R label="Replacement cost">{fmtMoney(p.replacementCost)}</R>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Insurance"
      editing
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        key={p.version}
        action={(fd) => start(async () => { await save(fd); setEditing(false); })}
        className="grid grid-cols-2 gap-3"
      >
        <L label="Carrier"><Input name="insuranceCarrier" defaultValue={p.insuranceCarrier ?? ""} /></L>
        <L label="Policy #"><Input name="insurancePolicyNo" defaultValue={p.insurancePolicyNo ?? ""} /></L>
        <L label="Premium"><Input name="insurancePremium" defaultValue={p.insurancePremium ?? ""} /></L>
        <L label="Replacement cost"><Input name="replacementCost" defaultValue={p.replacementCost ?? ""} /></L>
        <L label="Renewal date"><Input name="insuranceRenewalDate" type="date" defaultValue={p.insuranceRenewalDate ?? ""} /></L>
      </form>
    </SectionCard>
  );
}
