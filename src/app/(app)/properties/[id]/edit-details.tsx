"use client";
import { Button, Field, Input, SectionCard, Select, Textarea } from "@/components/ui";
import { InlineAddressField } from "@/components/inline-address-field";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { fmtDay } from "@/lib/dates";
import { patchProperty } from "../actions";
import { useSectionSave } from "./use-section-save";

export type EditableProperty = {
  id: string;
  address: string;
  llcOwner: string | null;
  attorney: string | null;
  status: string | null;
  strategy: string | null;
  refiTarget: string | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  closingCosts: string | null;
  rehabAmount: string | null;
  value: string | null;
  refinanceDate: string | null;
  sqft: number | null;
  rentalRegistrationExpiry: string | null;
  propertyTaxDueDate: string | null;
};

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-muted">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

/**
 * The page's h1, edited in place: shares InlineAddressField with the deal page.
 * Sent with the address it replaces, so a rename someone else saved meanwhile
 * isn't overwritten; a refused save or a dropped connection shows as a toast.
 */
export function PropertyAddressField({ id, value }: { id: string; value: string }) {
  const { toast } = useToast();
  return (
    <InlineAddressField
      value={value}
      heading
      multiline
      onCommit={async (address) => {
        const r = await callAction(() => patchProperty(id, { address }, { address: value }));
        if (!r.ok) toast({ message: r.error });
      }}
    />
  );
}

export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const { loaded: f, open, close, pending, error, onSubmit } = useSectionSave(p.id, p);
  const formId = `property-details-${p.id}`;

  if (!f) {
    return (
      <SectionCard title="Details" onEdit={open}>
        <dl>
          <Field label="Value">{fmtMoney(p.value)}</Field>
          <Field label="Purchase date">{fmtDay(p.purchaseDate)}</Field>
          <Field label="Purchase price">{fmtMoney(p.purchasePrice)}</Field>
          <Field label="Closing costs">{fmtMoney(p.closingCosts)}</Field>
          <Field label="Rehab amount">{fmtMoney(p.rehabAmount)}</Field>
          <Field label="Refinance date">{fmtDay(p.refinanceDate)}</Field>
          <Field label="Refi target">{p.refiTarget ?? "—"}</Field>
          <Field label="Strategy">{p.strategy ?? "—"}</Field>
          <Field label="Sq ft">{p.sqft?.toLocaleString() ?? "—"}</Field>
          <Field label="Entity">{p.llcOwner ?? "—"}</Field>
          <Field label="Attorney">{p.attorney ?? "—"}</Field>
          <Field label="Status">{p.status ?? "—"}</Field>
          <Field label="Rental registration expires">{fmtDay(p.rentalRegistrationExpiry)}</Field>
          <Field label="Property tax due">{fmtDay(p.propertyTaxDueDate)}</Field>
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
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-3">
        <L label="Address"><Input name="address" defaultValue={f.address} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Value"><Input name="value" defaultValue={f.value ?? ""} /></L>
          <L label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={f.purchaseDate ?? ""} /></L>
          <L label="Purchase price"><Input name="purchasePrice" defaultValue={f.purchasePrice ?? ""} /></L>
          <L label="Closing costs"><Input name="closingCosts" defaultValue={f.closingCosts ?? ""} /></L>
          <L label="Rehab amount"><Input name="rehabAmount" defaultValue={f.rehabAmount ?? ""} /></L>
          <L label="Refinance date"><Input name="refinanceDate" type="date" defaultValue={f.refinanceDate ?? ""} /></L>
          <L label="Refi target"><Input name="refiTarget" defaultValue={f.refiTarget ?? ""} /></L>
          <L label="Strategy">
            <Select name="strategy" defaultValue={f.strategy ?? ""}>
              <option value="">—</option>
              {[...new Set([f.strategy, ...PROPERTY_STRATEGIES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Sq ft"><Input name="sqft" type="number" defaultValue={f.sqft ?? ""} /></L>
          <L label="Entity / LLC"><Input name="llcOwner" defaultValue={f.llcOwner ?? ""} /></L>
          <L label="Attorney"><Input name="attorney" defaultValue={f.attorney ?? ""} /></L>
          <L label="Status">
            <Select name="status" defaultValue={f.status ?? ""}>
              <option value="">—</option>
              {[...new Set([f.status, ...PROPERTY_STATUSES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Rental registration expires">
            <Input
              name="rentalRegistrationExpiry"
              type="date"
              defaultValue={f.rentalRegistrationExpiry ?? ""}
            />
          </L>
          <L label="Property tax due">
            <Input name="propertyTaxDueDate" type="date" defaultValue={f.propertyTaxDueDate ?? ""} />
          </L>
        </div>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </SectionCard>
  );
}

export function PropertyNotesSection({ id, notes }: { id: string; notes: string | null }) {
  const { loaded: f, open, close, pending, error, onSubmit } = useSectionSave(id, { notes });
  const formId = `property-notes-${id}`;

  if (!f) {
    return (
      <SectionCard title="Notes" onEdit={open}>
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
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-2">
        <Textarea
          name="notes"
          rows={6}
          defaultValue={f.notes ?? ""}
          placeholder="Additional notes on this property…"
        />
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </SectionCard>
  );
}
