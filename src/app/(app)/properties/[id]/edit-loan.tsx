"use client";
import { RailFold } from "@/components/rail-fold";
import { Section } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { onPropertyFieldRequest, openPropertyField } from "./edit-field-event";
import { ChangeCodeMenu, PropertyEscrow, PropertyFact, PropertyKeyDate, isBlank } from "./property-fact";

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
 * changed where it stands; the empty ones fold behind "N more fields"
 * (docs/specs/property-page.md 2.2), the escrow switch never. Equity and LTV
 * aren't repeated here: the fact strip over the record shows both (charts
 * question 3). The loan number is a code: one tap copies it, and the
 * section's ⋯ holds "Change loan number".
 */
export function PropertyLoanSection({ loan: p }: { loan: EditableLoan }) {
  const context = `Loan · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  const loanNumber = p.loanNumber?.trim();
  return (
    <Section title="Loan" actions={loanNumber ? <ChangeCodeMenu title="Loan" field="loanNumber" change="Change loan number" /> : undefined}>
      <RailFold
        listen={onPropertyFieldRequest}
        reopen={openPropertyField}
        rows={[
          {
            key: "loanMaturityDate",
            empty: isBlank(p.loanMaturityDate),
            keep: true,
            node: <PropertyKeyDate {...common} field="loanMaturityDate" label="Maturity" date={p.loanMaturityDate} addLabel="Add maturity date" leadDays={60} />,
          },
          {
            key: "currentLoan",
            empty: isBlank(p.currentLoan),
            node: <PropertyFact {...common} field="currentLoan" label="Balance" kind="money" value={p.currentLoan} empty="Add balance" />,
          },
          {
            key: "lender",
            empty: isBlank(p.lender),
            node: <PropertyFact {...common} field="lender" label="Lender" kind="text" value={p.lender} empty="Add lender" />,
          },
          {
            key: "loanServicer",
            empty: isBlank(p.loanServicer),
            node: <PropertyFact {...common} field="loanServicer" label="Servicer" kind="text" value={p.loanServicer} empty="Add servicer" />,
          },
          {
            key: "loanNumber",
            empty: isBlank(p.loanNumber),
            node: (
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
            ),
          },
          {
            key: "loanType",
            empty: isBlank(p.loanType),
            node: <PropertyFact {...common} field="loanType" label="Loan type" kind="text" value={p.loanType} empty="Add loan type" />,
          },
          {
            key: "loanOriginalAmount",
            empty: isBlank(p.loanOriginalAmount),
            node: (
              <PropertyFact
                {...common}
                field="loanOriginalAmount"
                label="Original loan"
                name="Original amount"
                kind="money"
                value={p.loanOriginalAmount}
                empty="Add original amount"
              />
            ),
          },
          {
            key: "loanRate",
            empty: isBlank(p.loanRate),
            node: <PropertyFact {...common} field="loanRate" label="Rate" kind="percent" value={p.loanRate} empty="Add rate" />,
          },
          {
            key: "loanPaymentMonthly",
            empty: isBlank(p.loanPaymentMonthly),
            node: <PropertyFact {...common} field="loanPaymentMonthly" label="Payment / mo" name="Payment" kind="money" value={p.loanPaymentMonthly} empty="Add payment" />,
          },
          { key: "loanEscrow", empty: false, keep: true, node: <PropertyEscrow id={p.id} escrow={p.loanEscrow} /> },
          {
            key: "loanOriginationDate",
            empty: isBlank(p.loanOriginationDate),
            node: (
              <PropertyFact
                {...common}
                field="loanOriginationDate"
                label="Originated"
                name="Origination date"
                kind="date"
                value={p.loanOriginationDate}
                empty="Add origination date"
              />
            ),
          },
        ]}
      />
    </Section>
  );
}
