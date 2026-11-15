"use client";
import { RailFold } from "@/components/rail-fold";
import { Section } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { onPropertyFieldRequest, openPropertyField } from "./edit-field-event";
import { MissingTitle, useMissingFields } from "./missing-context";
import { ChangeCodeMenu, PropertyFact, PropertyKeyDate, isBlank } from "./property-fact";

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
 * Insurance (forms 4.2, 3.2 A): the renewal first, since a lapse means a
 * force-placed policy, then the premium and the replacement cost, always
 * shown and each changed where it stands. Carrier, policy number, coverage,
 * deductible and liability fold behind "5 more fields", filled or not
 * (docs/specs/property-page.md 2.2). The policy number is a code: one tap
 * copies it, and the section's ⋯ holds "Change policy number".
 */
export function PropertyInsuranceSection({ insurance: p }: { insurance: EditableInsurance }) {
  const missing = useMissingFields();
  const context = `Insurance · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  const policy = p.insurancePolicyNo?.trim();
  return (
    <Section title={<MissingTitle section="insurance">Insurance</MissingTitle>} actions={policy ? <ChangeCodeMenu title="Insurance" field="insurancePolicyNo" change="Change policy number" /> : undefined}>
      <RailFold
        missing={missing}
        listen={onPropertyFieldRequest}
        reopen={openPropertyField}
        rows={[
          {
            key: "insuranceRenewalDate",
            empty: isBlank(p.insuranceRenewalDate),
            keep: true,
            node: (
              <PropertyKeyDate
                {...common}
                field="insuranceRenewalDate"
                label="Renewal"
                name="Renewal date"
                date={p.insuranceRenewalDate}
                addLabel="Add renewal date"
                leadDays={30}
              />
            ),
          },
          {
            key: "insuranceCarrier",
            empty: isBlank(p.insuranceCarrier),
            fold: true,
            node: <PropertyFact {...common} field="insuranceCarrier" label="Carrier" kind="text" value={p.insuranceCarrier} empty="Add carrier" />,
          },
          {
            key: "insurancePolicyNo",
            empty: isBlank(p.insurancePolicyNo),
            fold: true,
            node: (
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
            ),
          },
          {
            key: "insurancePremium",
            empty: isBlank(p.insurancePremium),
            keep: true,
            node: <PropertyFact {...common} field="insurancePremium" label="Premium" kind="money" value={p.insurancePremium} empty="Add premium" />,
          },
          {
            key: "replacementCost",
            empty: isBlank(p.replacementCost),
            keep: true,
            node: (
              <PropertyFact
                {...common}
                field="replacementCost"
                label="Replacement"
                name="Replacement cost"
                kind="money"
                value={p.replacementCost}
                empty="Add replacement cost"
              />
            ),
          },
          {
            key: "insuranceCoverage",
            empty: isBlank(p.insuranceCoverage),
            fold: true,
            node: <PropertyFact {...common} field="insuranceCoverage" label="Coverage" kind="money" value={p.insuranceCoverage} empty="Add coverage" />,
          },
          {
            key: "insuranceDeductible",
            empty: isBlank(p.insuranceDeductible),
            fold: true,
            node: <PropertyFact {...common} field="insuranceDeductible" label="Deductible" kind="money" value={p.insuranceDeductible} empty="Add deductible" />,
          },
          {
            key: "insuranceLiability",
            empty: isBlank(p.insuranceLiability),
            fold: true,
            node: <PropertyFact {...common} field="insuranceLiability" label="Liability" kind="text" value={p.insuranceLiability} empty="Add liability" />,
          },
        ]}
      />
    </Section>
  );
}
