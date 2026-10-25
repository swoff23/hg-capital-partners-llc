"use client";
import { Button, Input, SectionCard, Select } from "@/components/ui";
import { Code } from "@/components/code";
import { loanPosition } from "@/lib/properties/figures";
import { LabeledField as L } from "../labeled-field";
import { dayFact, moneyFact, textFact } from "./fact-values";
import { KeyDate } from "./key-date";
import { RailFact, RailList, SaveError } from "./record-ui";
import { useSectionSave } from "./use-section-save";

export type EditableLoan = {
  id: string;
  /** The property's value, for LTV; edited under Details. */
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

const rate = (r: string | null) => {
  const n = r == null ? NaN : Number(r);
  return Number.isFinite(n) && n > 0 ? <span className="num">{n}%</span> : null;
};

export function PropertyLoanSection({ loan: p }: { loan: EditableLoan }) {
  const { loaded: f, open, close, pending, error, onSubmit, formRef } = useSectionSave(p.id, p);
  const formId = `property-loan-${p.id}`;

  if (!f) {
    const position = loanPosition(p.value, p.currentLoan);
    const loanNumber = textFact(p.loanNumber);
    return (
      <SectionCard title="Loan" onEdit={open}>
        <RailList>
          <KeyDate
            label="Maturity"
            date={p.loanMaturityDate}
            addLabel="Add maturity date"
            onAdd={() => open("loanMaturityDate")}
          />
          <RailFact label="Balance" empty="Add balance" onAdd={() => open("currentLoan")}>
            {moneyFact(p.currentLoan)}
          </RailFact>
          {/* Derived from value and balance: nothing to add here, so an empty one is the dash. Equity isn't
              repeated here, since the fact strip over the record shows it; each figure shows once. */}
          <RailFact label="LTV">{position.ltv && <span className="num">{position.ltv}</span>}</RailFact>
          <RailFact label="Lender" empty="Add lender" onAdd={() => open("lender")}>
            {textFact(p.lender)}
          </RailFact>
          <RailFact label="Servicer" empty="Add servicer" onAdd={() => open("loanServicer")}>
            {textFact(p.loanServicer)}
          </RailFact>
          <RailFact label="Loan #" empty="Add loan number" onAdd={() => open("loanNumber")}>
            {loanNumber && <Code value={loanNumber} label="Loan number" />}
          </RailFact>
          <RailFact label="Loan type" empty="Add loan type" onAdd={() => open("loanType")}>
            {textFact(p.loanType)}
          </RailFact>
          <RailFact label="Original loan" empty="Add original amount" onAdd={() => open("loanOriginalAmount")}>
            {moneyFact(p.loanOriginalAmount)}
          </RailFact>
          <RailFact label="Rate" empty="Add rate" onAdd={() => open("loanRate")}>
            {rate(p.loanRate)}
          </RailFact>
          <RailFact label="Payment / mo" empty="Add payment" onAdd={() => open("loanPaymentMonthly")}>
            {moneyFact(p.loanPaymentMonthly)}
          </RailFact>
          <RailFact label="Escrow">{p.loanEscrow ? "Yes" : "No"}</RailFact>
          <RailFact label="Originated" empty="Add origination date" onAdd={() => open("loanOriginationDate")}>
            {dayFact(p.loanOriginationDate)}
          </RailFact>
        </RailList>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Loan"
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
        <L label="Balance">
          <Input name="currentLoan" defaultValue={f.currentLoan ?? ""} />
        </L>
        <L label="Lender">
          <Input name="lender" defaultValue={f.lender ?? ""} />
        </L>
        <L label="Servicer">
          <Input name="loanServicer" defaultValue={f.loanServicer ?? ""} />
        </L>
        <L label="Loan #">
          <Input name="loanNumber" defaultValue={f.loanNumber ?? ""} />
        </L>
        <L label="Loan type">
          <Input name="loanType" defaultValue={f.loanType ?? ""} />
        </L>
        <L label="Original amount">
          <Input name="loanOriginalAmount" defaultValue={f.loanOriginalAmount ?? ""} />
        </L>
        <L label="Rate %">
          <Input name="loanRate" defaultValue={f.loanRate ?? ""} />
        </L>
        <L label="Payment / mo">
          <Input name="loanPaymentMonthly" defaultValue={f.loanPaymentMonthly ?? ""} />
        </L>
        <L label="Escrow">
          <Select name="loanEscrow" defaultValue={f.loanEscrow ? "yes" : "no"}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </L>
        <L label="Origination date">
          <Input name="loanOriginationDate" type="date" defaultValue={f.loanOriginationDate ?? ""} />
        </L>
        <L label="Maturity date">
          <Input name="loanMaturityDate" type="date" defaultValue={f.loanMaturityDate ?? ""} />
        </L>
        {error && <SaveError className="col-span-2">{error}</SaveError>}
      </form>
    </SectionCard>
  );
}
