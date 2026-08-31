"use client";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { patchProperty } from "../actions";

export type EditableProperty = {
  id: string;
  version: string;
  address: string;
  llcOwner: string | null;
  attorney: string | null;
  lender: string | null;
  loanServicer: string | null;
  status: string | null;
  strategy: string | null;
  refiTarget: string | null;
  purchaseDate: string | null;
  refinanceDate: string | null;
  purchasePrice: string | null;
  currentLoan: string | null;
  value: string | null;
  replacementCost: string | null;
  rehabAmount: string | null;
  rehabMonths: string | null;
  sqft: number | null;
};

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const GroupHeading = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">
    {children}
  </h4>
);

/** Rehab duration in months — some imported rows are corrupt (large negatives). */
const months = (raw: string | null) => {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 120) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} mo`;
};

export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = patchProperty.bind(null, p.id);
  const formId = `property-details-${p.id}`;

  if (!editing) {
    return (
      <SectionCard title="Details" onEdit={() => setEditing(true)}>
        <GroupHeading>Financing</GroupHeading>
        <dl>
          <Field label="Lender">{p.lender ?? "—"}</Field>
          <Field label="Loan servicer">{p.loanServicer ?? "—"}</Field>
          <Field label="Current loan">{fmtMoney(p.currentLoan)}</Field>
          <Field label="Value">{fmtMoney(p.value)}</Field>
          <Field label="Replacement cost">{fmtMoney(p.replacementCost)}</Field>
          <Field label="Refinance date">{fmtDate(p.refinanceDate)}</Field>
          <Field label="Refi target">{p.refiTarget ?? "—"}</Field>
        </dl>

        <GroupHeading>Acquisition</GroupHeading>
        <dl>
          <Field label="Purchase date">{fmtDate(p.purchaseDate)}</Field>
          <Field label="Purchase price">{fmtMoney(p.purchasePrice)}</Field>
          <Field label="Rehab amount">{fmtMoney(p.rehabAmount)}</Field>
          <Field label="Rehab months">{months(p.rehabMonths)}</Field>
          <Field label="Strategy">{p.strategy ?? "—"}</Field>
          <Field label="Sq ft">{p.sqft?.toLocaleString() ?? "—"}</Field>
        </dl>

        <GroupHeading>Legal / admin</GroupHeading>
        <dl>
          <Field label="Entity">{p.llcOwner ?? "—"}</Field>
          <Field label="Attorney">{p.attorney ?? "—"}</Field>
        </dl>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Details"
      editing
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
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
        className="space-y-3"
      >
        <L label="Address"><Input name="address" defaultValue={p.address} /></L>

        <GroupHeading>Financing</GroupHeading>
        <div className="grid grid-cols-2 gap-3">
          <L label="Lender"><Input name="lender" defaultValue={p.lender ?? ""} /></L>
          <L label="Loan servicer"><Input name="loanServicer" defaultValue={p.loanServicer ?? ""} /></L>
          <L label="Current loan"><Input name="currentLoan" defaultValue={p.currentLoan ?? ""} /></L>
          <L label="Value"><Input name="value" defaultValue={p.value ?? ""} /></L>
          <L label="Replacement cost"><Input name="replacementCost" defaultValue={p.replacementCost ?? ""} /></L>
          <L label="Refinance date"><Input name="refinanceDate" type="date" defaultValue={p.refinanceDate ?? ""} /></L>
          <L label="Refi target"><Input name="refiTarget" defaultValue={p.refiTarget ?? ""} /></L>
        </div>

        <GroupHeading>Acquisition</GroupHeading>
        <div className="grid grid-cols-2 gap-3">
          <L label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={p.purchaseDate ?? ""} /></L>
          <L label="Purchase price"><Input name="purchasePrice" defaultValue={p.purchasePrice ?? ""} /></L>
          <L label="Rehab amount"><Input name="rehabAmount" defaultValue={p.rehabAmount ?? ""} /></L>
          <L label="Rehab months"><Input name="rehabMonths" type="number" step="0.5" defaultValue={p.rehabMonths ?? ""} /></L>
          <L label="Strategy">
            <Select name="strategy" defaultValue={p.strategy ?? ""}>
              <option value="">—</option>
              {[...new Set([p.strategy, ...PROPERTY_STRATEGIES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Sq ft"><Input name="sqft" type="number" defaultValue={p.sqft ?? ""} /></L>
        </div>

        <GroupHeading>Legal / admin</GroupHeading>
        <div className="grid grid-cols-2 gap-3">
          <L label="Entity / LLC"><Input name="llcOwner" defaultValue={p.llcOwner ?? ""} /></L>
          <L label="Attorney"><Input name="attorney" defaultValue={p.attorney ?? ""} /></L>
          <L label="Status">
            <Select name="status" defaultValue={p.status ?? ""}>
              <option value="">—</option>
              {[...new Set([p.status, ...PROPERTY_STATUSES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
        </div>
      </form>
    </SectionCard>
  );
}

export function PropertyNotesSection({
  id,
  version,
  notes,
}: {
  id: string;
  version: string;
  notes: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = patchProperty.bind(null, id);
  const formId = `property-notes-${id}`;

  if (!editing) {
    return (
      <SectionCard title="Notes" onEdit={() => setEditing(true)}>
        {notes ? (
          <p className="whitespace-pre-wrap text-sm">{notes}</p>
        ) : (
          <p className="text-sm text-muted">No notes yet.</p>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Notes"
      editing
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
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
        key={version}
        action={(fd) => start(async () => { await save(fd); setEditing(false); })}
      >
        <Textarea
          name="notes"
          rows={6}
          defaultValue={notes ?? ""}
          placeholder="Additional notes on this property…"
        />
      </form>
    </SectionCard>
  );
}

export function SectionCard({
  title,
  children,
  onEdit,
  editing,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h3 className="shrink-0 text-sm font-semibold">{title}</h3>
        {editing
          ? actions
          : onEdit && (
              <button
                onClick={onEdit}
                className="text-xs font-medium text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
              >
                Edit
              </button>
            )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
