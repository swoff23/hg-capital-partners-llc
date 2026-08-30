"use client";
import { useState, useTransition } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { patchProperty } from "../actions";

export type EditableProperty = {
  id: string;
  version: string;
  address: string;
  llcOwner: string | null;
  refiTarget: string | null;
  attorney: string | null;
  lender: string | null;
  loanServicer: string | null;
  status: string | null;
  strategy: string | null;
  purchaseDate: string | null;
  refinanceDate: string | null;
  purchasePrice: string | null;
  currentLoan: string | null;
  value: string | null;
  rehabAmount: string | null;
  sqft: number | null;
  unitCount: number | null;
  notes: string | null;
};

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

export function EditPropertyDetails({ property: p }: { property: EditableProperty }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const save = patchProperty.bind(null, p.id);

  return (
    <form
      key={p.version}
      action={(fd) =>
        start(async () => {
          await save(fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        })
      }
      className="space-y-3"
    >
      <L label="Address">
        <Input name="address" defaultValue={p.address} />
      </L>
      <div className="grid grid-cols-2 gap-3">
        <L label="Entity / LLC">
          <Input name="llcOwner" defaultValue={p.llcOwner ?? ""} />
        </L>
        <L label="Refi target">
          <Input name="refiTarget" defaultValue={p.refiTarget ?? ""} />
        </L>
        <L label="Status">
          <Select name="status" defaultValue={p.status ?? ""}>
            <option value="">—</option>
            {[...new Set([p.status, ...PROPERTY_STATUSES].filter(Boolean))].map((s) => (
              <option key={s as string}>{s as string}</option>
            ))}
          </Select>
        </L>
        <L label="Strategy">
          <Select name="strategy" defaultValue={p.strategy ?? ""}>
            <option value="">—</option>
            {[...new Set([p.strategy, ...PROPERTY_STRATEGIES].filter(Boolean))].map((s) => (
              <option key={s as string}>{s as string}</option>
            ))}
          </Select>
        </L>
        <L label="Lender">
          <Input name="lender" defaultValue={p.lender ?? ""} />
        </L>
        <L label="Loan servicer">
          <Input name="loanServicer" defaultValue={p.loanServicer ?? ""} />
        </L>
        <L label="Attorney">
          <Input name="attorney" defaultValue={p.attorney ?? ""} />
        </L>
        <L label="Units">
          <Input name="unitCount" type="number" defaultValue={p.unitCount ?? ""} />
        </L>
        <L label="Sq ft">
          <Input name="sqft" type="number" defaultValue={p.sqft ?? ""} />
        </L>
        <L label="Purchase date">
          <Input name="purchaseDate" type="date" defaultValue={p.purchaseDate ?? ""} />
        </L>
        <L label="Purchase price">
          <Input name="purchasePrice" defaultValue={p.purchasePrice ?? ""} />
        </L>
        <L label="Refinance date">
          <Input name="refinanceDate" type="date" defaultValue={p.refinanceDate ?? ""} />
        </L>
        <L label="Current loan">
          <Input name="currentLoan" defaultValue={p.currentLoan ?? ""} />
        </L>
        <L label="Value">
          <Input name="value" defaultValue={p.value ?? ""} />
        </L>
        <L label="Rehab amount">
          <Input name="rehabAmount" defaultValue={p.rehabAmount ?? ""} />
        </L>
      </div>
      <L label="Notes">
        <Textarea name="notes" rows={3} defaultValue={p.notes ?? ""} />
      </L>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </form>
  );
}
