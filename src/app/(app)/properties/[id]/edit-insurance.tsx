"use client";
import { RailList } from "@/components/rail";
import { Section } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { ChangeCodeMenu, PropertyFact, PropertyKeyDate } from "./property-fact";

export type EditableInsurance = {
  id: string;
  /** The property's address, to name the record in a one-field sheet. */
  address: string;
  insuranceCarrier: string | null;
  insurancePolicyNo: string | null;
  insurancePremium: string | null;
  insuranceCoverage: string | null;
  insuranceDeductible: string | null;
  insuranceLiability: string | null;
  insuranceRenewalDate: string | null;
  replacementCost: string | null;
};

/**
 * Insurance (forms 4.2, 3.2 A): the renewal first and always shown, since a
 * lapse means a force-placed policy, then the carrier, the policy and the
 * amounts. Each is changed where it stands. The policy number is a code: one
 * tap copies it, and the section's ⋯ holds "Change policy number".
 */
export function PropertyInsuranceSection({ insurance: p }: { insurance: EditableInsurance }) {
  const context = `Insurance · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  const policy = p.insurancePolicyNo?.trim();
  return (
    <Section title="Insurance" actions={policy ? <ChangeCodeMenu title="Insurance" field="insurancePolicyNo" change="Change policy number" /> : undefined}>
      <RailList>
        <PropertyKeyDate
          {...common}
          field="insuranceRenewalDate"
          label="Renewal"
          name="Renewal date"
          date={p.insuranceRenewalDate}
          addLabel="Add renewal date"
          leadDays={30}
        />
        <PropertyFact {...common} field="insuranceCarrier" label="Carrier" kind="text" value={p.insuranceCarrier} empty="Add carrier" />
        <PropertyFact
          {...common}
          field="insurancePolicyNo"
          label="Policy #"
          name="Policy number"
          kind="text"
          code="Policy number"
          value={p.insurancePolicyNo}
          empty="Add policy number"
        />
        <PropertyFact {...common} field="insurancePremium" label="Premium" kind="money" value={p.insurancePremium} empty="Add premium" />
        <PropertyFact
          {...common}
          field="replacementCost"
          label="Replacement"
          name="Replacement cost"
          kind="money"
          value={p.replacementCost}
          empty="Add replacement cost"
        />
        <PropertyFact {...common} field="insuranceCoverage" label="Coverage" kind="money" value={p.insuranceCoverage} empty="Add coverage" />
        <PropertyFact {...common} field="insuranceDeductible" label="Deductible" kind="money" value={p.insuranceDeductible} empty="Add deductible" />
        <PropertyFact {...common} field="insuranceLiability" label="Liability" kind="text" value={p.insuranceLiability} empty="Add liability" />
      </RailList>
    </Section>
  );
}
