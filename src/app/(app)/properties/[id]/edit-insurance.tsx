"use client";
import { Button, Input, SectionCard } from "@/components/ui";
import { Code } from "@/components/code";
import { LabeledField as L } from "../labeled-field";
import { moneyFact, textFact } from "./fact-values";
import { KeyDate } from "./key-date";
import { RailFact, RailList, SaveError } from "./record-ui";
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

export function PropertyInsuranceSection({ insurance: p }: { insurance: EditableInsurance }) {
  const { loaded: f, open, close, pending, error, onSubmit, formRef } = useSectionSave(p.id, p);
  const formId = `property-insurance-${p.id}`;

  if (!f) {
    const policy = textFact(p.insurancePolicyNo);
    return (
      <SectionCard title="Insurance" onEdit={open}>
        <RailList>
          <KeyDate
            label="Renewal"
            date={p.insuranceRenewalDate}
            addLabel="Add renewal date"
            onAdd={() => open("insuranceRenewalDate")}
          />
          <RailFact label="Carrier" empty="Add carrier" onAdd={() => open("insuranceCarrier")}>
            {textFact(p.insuranceCarrier)}
          </RailFact>
          <RailFact label="Policy #" empty="Add policy number" onAdd={() => open("insurancePolicyNo")}>
            {policy && <Code value={policy} label="Policy number" />}
          </RailFact>
          <RailFact label="Premium" empty="Add premium" onAdd={() => open("insurancePremium")}>
            {moneyFact(p.insurancePremium)}
          </RailFact>
          <RailFact label="Replacement" empty="Add replacement cost" onAdd={() => open("replacementCost")}>
            {moneyFact(p.replacementCost)}
          </RailFact>
          <RailFact label="Coverage" empty="Add coverage" onAdd={() => open("insuranceCoverage")}>
            {moneyFact(p.insuranceCoverage)}
          </RailFact>
          <RailFact label="Deductible" empty="Add deductible" onAdd={() => open("insuranceDeductible")}>
            {moneyFact(p.insuranceDeductible)}
          </RailFact>
          <RailFact label="Liability" empty="Add liability" onAdd={() => open("insuranceLiability")}>
            {textFact(p.insuranceLiability)}
          </RailFact>
        </RailList>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Insurance"
      editing
      actions={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmit={onSubmit} className="grid grid-cols-2 items-end gap-3">
        <L label="Carrier">
          <Input name="insuranceCarrier" defaultValue={f.insuranceCarrier ?? ""} />
        </L>
        <L label="Policy #">
          <Input name="insurancePolicyNo" defaultValue={f.insurancePolicyNo ?? ""} />
        </L>
        <L label="Premium">
          <Input name="insurancePremium" defaultValue={f.insurancePremium ?? ""} />
        </L>
        <L label="Replacement cost">
          <Input name="replacementCost" defaultValue={f.replacementCost ?? ""} />
        </L>
        <L label="Coverage">
          <Input name="insuranceCoverage" defaultValue={f.insuranceCoverage ?? ""} />
        </L>
        <L label="Deductible">
          <Input name="insuranceDeductible" defaultValue={f.insuranceDeductible ?? ""} />
        </L>
        <L label="Liability">
          <Input name="insuranceLiability" defaultValue={f.insuranceLiability ?? ""} />
        </L>
        <L label="Renewal date">
          <Input name="insuranceRenewalDate" type="date" defaultValue={f.insuranceRenewalDate ?? ""} />
        </L>
        {error && <SaveError className="col-span-2">{error}</SaveError>}
      </form>
    </SectionCard>
  );
}
