"use client";
import { useState, useTransition } from "react";
import { Button, Field, Input, SectionCard, Select, Textarea } from "@/components/ui";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { patchProperty } from "../actions";

export type EditableProperty = {
  id: string;
  version: string;
  address: string;
  llcOwner: string | null;
  status: string | null;
  strategy: string | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  value: string | null;
  refinanceDate: string | null;
  sqft: number | null;
  rentalRegistrationExpiry: string | null;
};

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

/** Page heading, editable in place — mirrors deals' AddressField, adapted to patchProperty's FormData signature. */
export function PropertyAddressField({ id, value }: { id: string; value: string }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  function commit() {
    const trimmed = v.trim();
    if (!trimmed || trimmed === value) {
      setV(value);
      return;
    }
    const fd = new FormData();
    fd.set("address", trimmed);
    start(() => patchProperty(id, fd));
  }

  return (
    <div className="group/addr relative -mx-2">
      <input
        aria-label="Address"
        value={v}
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setV(value);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-md bg-transparent px-2 py-1 pr-6 text-xl font-semibold tracking-tight text-foreground outline-none transition-colors hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-40"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted opacity-0 transition-opacity group-hover/addr:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <path d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7.2 7.2-3 .8.8-3 7.2-7.2Z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = patchProperty.bind(null, p.id);
  const formId = `property-details-${p.id}`;

  if (!editing) {
    return (
      <SectionCard title="Details" onEdit={() => setEditing(true)}>
        <dl>
          <Field label="Value">{fmtMoney(p.value)}</Field>
          <Field label="Purchase date">{fmtDate(p.purchaseDate)}</Field>
          <Field label="Purchase price">{fmtMoney(p.purchasePrice)}</Field>
          <Field label="Refinance date">{fmtDate(p.refinanceDate)}</Field>
          <Field label="Strategy">{p.strategy ?? "—"}</Field>
          <Field label="Sq ft">{p.sqft?.toLocaleString() ?? "—"}</Field>
          <Field label="Entity">{p.llcOwner ?? "—"}</Field>
          <Field label="Status">{p.status ?? "—"}</Field>
          <Field label="Rental registration expires">{fmtDate(p.rentalRegistrationExpiry)}</Field>
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
        <div className="grid grid-cols-2 gap-3">
          <L label="Value"><Input name="value" defaultValue={p.value ?? ""} /></L>
          <L label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={p.purchaseDate ?? ""} /></L>
          <L label="Purchase price"><Input name="purchasePrice" defaultValue={p.purchasePrice ?? ""} /></L>
          <L label="Refinance date"><Input name="refinanceDate" type="date" defaultValue={p.refinanceDate ?? ""} /></L>
          <L label="Strategy">
            <Select name="strategy" defaultValue={p.strategy ?? ""}>
              <option value="">—</option>
              {[...new Set([p.strategy, ...PROPERTY_STRATEGIES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Sq ft"><Input name="sqft" type="number" defaultValue={p.sqft ?? ""} /></L>
          <L label="Entity / LLC"><Input name="llcOwner" defaultValue={p.llcOwner ?? ""} /></L>
          <L label="Status">
            <Select name="status" defaultValue={p.status ?? ""}>
              <option value="">—</option>
              {[...new Set([p.status, ...PROPERTY_STATUSES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Rental registration expires">
            <Input
              name="rentalRegistrationExpiry"
              type="date"
              defaultValue={p.rentalRegistrationExpiry ?? ""}
            />
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
