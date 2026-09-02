"use client";
import { useState, useTransition } from "react";
import { Button, Field, Input, SectionCard } from "@/components/ui";
import { cn, fmtMoney } from "@/lib/utils";
import { fmtDay, isPastDay, relativeDays } from "@/lib/dates";
import { patchProperty } from "../actions";

export type EditableLoan = {
  id: string;
  version: string;
  lender: string | null;
  loanServicer: string | null;
  loanNumber: string | null;
  loanOriginalAmount: string | null;
  loanRate: string | null;
  loanPaymentMonthly: string | null;
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
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = patchProperty.bind(null, p.id);
  const formId = `property-loan-${p.id}`;

  const overdue = isPastDay(p.loanMaturityDate);

  if (!editing) {
    return (
      <SectionCard title="Loan" onEdit={() => setEditing(true)}>
        {p.loanMaturityDate && (
          <div className="mb-3 rounded-lg border border-border bg-background px-3 py-2">
            <div className="text-xs text-muted">Maturity</div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{fmtDay(p.loanMaturityDate)}</span>
              <span
                className={cn(
                  "text-xs",
                  overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted",
                )}
              >
                {relativeDays(p.loanMaturityDate)}
              </span>
            </div>
          </div>
        )}
        <dl>
          <Field label="Lender">{p.lender ?? "—"}</Field>
          <Field label="Servicer">{p.loanServicer ?? "—"}</Field>
          <Field label="Loan #">{p.loanNumber ?? "—"}</Field>
          <Field label="Original amount">{fmtMoney(p.loanOriginalAmount)}</Field>
          <Field label="Rate">{rate(p.loanRate)}</Field>
          <Field label="Payment / mo">{fmtMoney(p.loanPaymentMonthly)}</Field>
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
        <L label="Lender"><Input name="lender" defaultValue={p.lender ?? ""} /></L>
        <L label="Servicer"><Input name="loanServicer" defaultValue={p.loanServicer ?? ""} /></L>
        <L label="Loan #"><Input name="loanNumber" defaultValue={p.loanNumber ?? ""} /></L>
        <L label="Original amount"><Input name="loanOriginalAmount" defaultValue={p.loanOriginalAmount ?? ""} /></L>
        <L label="Rate %"><Input name="loanRate" defaultValue={p.loanRate ?? ""} /></L>
        <L label="Payment / mo"><Input name="loanPaymentMonthly" defaultValue={p.loanPaymentMonthly ?? ""} /></L>
        <L label="Origination date"><Input name="loanOriginationDate" type="date" defaultValue={p.loanOriginationDate ?? ""} /></L>
        <L label="Maturity date"><Input name="loanMaturityDate" type="date" defaultValue={p.loanMaturityDate ?? ""} /></L>
      </form>
    </SectionCard>
  );
}
