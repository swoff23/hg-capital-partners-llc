"use client";
import { RailList } from "@/components/rail";
import { Section } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { ChangeCodeMenu, PropertyEscrow, PropertyFact, PropertyKeyDate } from "./property-fact";

export type EditableLoan = {
  id: string;
  /** The property's address, to name the record in a one-field sheet. */
  address: string;
  /** The property's value; edited under Details, and read with the balance in the fact strip. */
  value: string | null;
  currentLoan: string | null;
  lender: string | null;
  loanServicer: string | null;
  loanNumber: string | null;
  loanType: string | null;
  loanOriginalAmount: string | null;
  loanRate: string | null;
  loanPaymentMonthly: string | null;
  loanEscrow: boolean;
  loanOriginationDate: string | null;
  loanMaturityDate: string | null;
};

/**
 * Loan (forms 4.2, 3.2 A): maturity first and always shown, since its reminder
 * only exists once it's set, then the balance, the lender and the terms, each
 * changed where it stands. Equity and LTV aren't repeated here: the fact strip
 * over the record shows both (charts question 3). The loan number is a code:
 * one tap copies it, and the section's ⋯ holds "Change loan number".
 */
export function PropertyLoanSection({ loan: p }: { loan: EditableLoan }) {
  const context = `Loan · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  const loanNumber = p.loanNumber?.trim();
  return (
    <Section title="Loan" actions={loanNumber ? <ChangeCodeMenu title="Loan" field="loanNumber" change="Change loan number" /> : undefined}>
      <RailList>
        <PropertyKeyDate
          {...common}
          field="loanMaturityDate"
          label="Maturity"
          date={p.loanMaturityDate}
          addLabel="Add maturity date"
          leadDays={60}
        />
        <PropertyFact {...common} field="currentLoan" label="Balance" kind="money" value={p.currentLoan} empty="Add balance" />
        <PropertyFact {...common} field="lender" label="Lender" kind="text" value={p.lender} empty="Add lender" />
        <PropertyFact {...common} field="loanServicer" label="Servicer" kind="text" value={p.loanServicer} empty="Add servicer" />
        <PropertyFact
          {...common}
          field="loanNumber"
          label="Loan #"
          name="Loan number"
          kind="text"
          code="Loan number"
          value={p.loanNumber}
          empty="Add loan number"
        />
        <PropertyFact {...common} field="loanType" label="Loan type" kind="text" value={p.loanType} empty="Add loan type" />
        <PropertyFact {...common} field="loanOriginalAmount" label="Original loan" name="Original amount" kind="money" value={p.loanOriginalAmount} empty="Add original amount" />
        <PropertyFact {...common} field="loanRate" label="Rate" kind="percent" value={p.loanRate} empty="Add rate" />
        <PropertyFact {...common} field="loanPaymentMonthly" label="Payment / mo" name="Payment" kind="money" value={p.loanPaymentMonthly} empty="Add payment" />
        <PropertyEscrow id={p.id} escrow={p.loanEscrow} />
        <PropertyFact
          {...common}
          field="loanOriginationDate"
          label="Originated"
          name="Origination date"
          kind="date"
          value={p.loanOriginationDate}
          empty="Add origination date"
        />
      </RailList>
    </Section>
  );
}
