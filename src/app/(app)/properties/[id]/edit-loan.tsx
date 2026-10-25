"use client";
import { Button, Field, Input, SectionCard, Select } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { fmtDay } from "@/lib/dates";
import { loanPosition } from "@/lib/properties/figures";
import { KeyDate } from "./key-date";
import { useSectionSave } from "./use-section-save";

export type EditableLoan = {
  id: string;
  /** The property's value, for equity and LTV; edited under Details. */
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

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const rate = (r: string | null) => {
  const n = r == null ? NaN : Number(r);
  return Number.isFinite(n) && n > 0 ? `${n}%` : "—";
};

export function PropertyLoanSection({ loan: p }: { loan: EditableLoan }) {
  const { loaded: f, open, close, pending, error, onSubmit } = useSectionSave(p.id, p);
  const formId = `property-loan-${p.id}`;

  if (!f) {
    const position = loanPosition(p.value, p.currentLoan);
    return (
      <SectionCard title="Loan" onEdit={open}>
        <KeyDate label="Maturity" date={p.loanMaturityDate} onAdd={open} />
        <dl>
          <Field label="Balance">{fmtMoney(p.currentLoan)}</Field>
          <Field label="Equity">{fmtMoney(position.equity)}</Field>
          <Field label="LTV">{position.ltv ?? "—"}</Field>
          <Field label="Lender">{p.lender ?? "—"}</Field>
          <Field label="Servicer">{p.loanServicer ?? "—"}</Field>
          <Field label="Loan #">{p.loanNumber ?? "—"}</Field>
          <Field label="Loan type">{p.loanType ?? "—"}</Field>
          <Field label="Original amount">{fmtMoney(p.loanOriginalAmount)}</Field>
          <Field label="Rate">{rate(p.loanRate)}</Field>
          <Field label="Payment / mo">{fmtMoney(p.loanPaymentMonthly)}</Field>
          <Field label="Escrow">{p.loanEscrow ? "Yes" : "No"}</Field>
          <Field label="Originated">{fmtDay(p.loanOriginationDate)}</Field>
        </dl>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Loan"
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
        <L label="Balance"><Input name="currentLoan" defaultValue={f.currentLoan ?? ""} /></L>
        <L label="Lender"><Input name="lender" defaultValue={f.lender ?? ""} /></L>
        <L label="Servicer"><Input name="loanServicer" defaultValue={f.loanServicer ?? ""} /></L>
        <L label="Loan #"><Input name="loanNumber" defaultValue={f.loanNumber ?? ""} /></L>
        <L label="Loan type"><Input name="loanType" defaultValue={f.loanType ?? ""} /></L>
        <L label="Original amount"><Input name="loanOriginalAmount" defaultValue={f.loanOriginalAmount ?? ""} /></L>
        <L label="Rate %"><Input name="loanRate" defaultValue={f.loanRate ?? ""} /></L>
        <L label="Payment / mo"><Input name="loanPaymentMonthly" defaultValue={f.loanPaymentMonthly ?? ""} /></L>
        <L label="Escrow">
          <Select name="loanEscrow" defaultValue={f.loanEscrow ? "yes" : "no"}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </L>
        <L label="Origination date"><Input name="loanOriginationDate" type="date" defaultValue={f.loanOriginationDate ?? ""} /></L>
        <L label="Maturity date"><Input name="loanMaturityDate" type="date" defaultValue={f.loanMaturityDate ?? ""} /></L>
        {error && <p role="alert" className="col-span-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </SectionCard>
  );
}
