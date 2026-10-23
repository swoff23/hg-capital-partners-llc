"use client";
import { Button, Input, SectionCard } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { KeyDate } from "./key-date";
import { useSectionSave } from "./use-section-save";

export type EditableInsurance = {
  id: string;
  insuranceCarrier: string | null;
  insurancePolicyNo: string | null;
  insurancePremium: string | null;
  insuranceCoverage: string | null;
  insuranceDeductible: string | null;
  insuranceLiability: string | null;
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
  const { loaded: f, open, close, pending, error, onSubmit } = useSectionSave(p.id, p);
  const formId = `property-insurance-${p.id}`;

  if (!f) {
    return (
      <SectionCard title="Insurance" onEdit={open}>
        <KeyDate label="Renewal" date={p.insuranceRenewalDate} onAdd={open} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <R label="Carrier">{p.insuranceCarrier ?? "—"}</R>
          <R label="Policy #">{p.insurancePolicyNo ?? "—"}</R>
          <R label="Premium">{fmtMoney(p.insurancePremium)}</R>
          <R label="Replacement cost">{fmtMoney(p.replacementCost)}</R>
          <R label="Coverage">{fmtMoney(p.insuranceCoverage)}</R>
          <R label="Deductible">{fmtMoney(p.insuranceDeductible)}</R>
          <R label="Liability">{p.insuranceLiability ?? "—"}</R>
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
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <L label="Carrier"><Input name="insuranceCarrier" defaultValue={f.insuranceCarrier ?? ""} /></L>
        <L label="Policy #"><Input name="insurancePolicyNo" defaultValue={f.insurancePolicyNo ?? ""} /></L>
        <L label="Premium"><Input name="insurancePremium" defaultValue={f.insurancePremium ?? ""} /></L>
        <L label="Replacement cost"><Input name="replacementCost" defaultValue={f.replacementCost ?? ""} /></L>
        <L label="Coverage"><Input name="insuranceCoverage" defaultValue={f.insuranceCoverage ?? ""} /></L>
        <L label="Deductible"><Input name="insuranceDeductible" defaultValue={f.insuranceDeductible ?? ""} /></L>
        <L label="Liability"><Input name="insuranceLiability" defaultValue={f.insuranceLiability ?? ""} /></L>
        <L label="Renewal date"><Input name="insuranceRenewalDate" type="date" defaultValue={f.insuranceRenewalDate ?? ""} /></L>
        {error && <p role="alert" className="col-span-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </SectionCard>
  );
}
