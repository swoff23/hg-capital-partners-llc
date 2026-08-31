"use client";
import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { cn, fmtDate, fmtMoney, relativeDays } from "@/lib/utils";
import { patchProperty } from "../actions";
import { SectionCard } from "./edit-details";

export type EditableInsurance = {
  id: string;
  version: string;
  insuranceCarrier: string | null;
  insurancePolicyNo: string | null;
  insuranceCoverage: string | null;
  insuranceDeductible: string | null;
  insuranceLiability: string | null;
  insurancePremium: string | null;
  insuranceRenewalDate: string | null;
};

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
        <dl>
          <Field label="Carrier">{p.insuranceCarrier ?? "—"}</Field>
          <Field label="Policy #">{p.insurancePolicyNo ?? "—"}</Field>
          <Field label="Coverage">{fmtMoney(p.insuranceCoverage)}</Field>
          <Field label="Deductible">{fmtMoney(p.insuranceDeductible)}</Field>
          <Field label="Liability">{p.insuranceLiability ?? "—"}</Field>
          <Field label="Premium">{fmtMoney(p.insurancePremium)}</Field>
        </dl>
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
        <L label="Coverage"><Input name="insuranceCoverage" defaultValue={p.insuranceCoverage ?? ""} /></L>
        <L label="Deductible"><Input name="insuranceDeductible" defaultValue={p.insuranceDeductible ?? ""} /></L>
        <L label="Liability"><Input name="insuranceLiability" placeholder="1M / 2M" defaultValue={p.insuranceLiability ?? ""} /></L>
        <L label="Premium"><Input name="insurancePremium" defaultValue={p.insurancePremium ?? ""} /></L>
        <L label="Renewal date"><Input name="insuranceRenewalDate" type="date" defaultValue={p.insuranceRenewalDate ?? ""} /></L>
      </form>
    </SectionCard>
  );
}
