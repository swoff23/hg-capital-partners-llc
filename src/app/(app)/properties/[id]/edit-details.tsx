"use client";
import { Button, Input, SectionCard, Select, Textarea } from "@/components/ui";
import { InlineAddressField } from "@/components/inline-address-field";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { patchProperty } from "../actions";
import { LabeledField as L } from "../labeled-field";
import { dayFact, moneyFact, textFact } from "./fact-values";
import { RailFact, RailList, RailVerb, SaveError } from "./record-ui";
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

/** Cancel and Save for a section editor's form. */
function EditActions({ formId, pending, onCancel }: { formId: string; pending: boolean; onCancel: () => void }) {
  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" form={formId} size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const { loaded: f, open, close, pending, error, onSubmit, formRef } = useSectionSave(p.id, p);
  const formId = `property-details-${p.id}`;

  if (!f) {
    return (
      <SectionCard title="Details" onEdit={open}>
        <RailList>
          <RailFact label="Value" empty="Add value" onAdd={() => open("value")}>
            {moneyFact(p.value)}
          </RailFact>
          <RailFact label="Purchase date" empty="Add purchase date" onAdd={() => open("purchaseDate")}>
            {dayFact(p.purchaseDate)}
          </RailFact>
          <RailFact label="Purchase price" empty="Add purchase price" onAdd={() => open("purchasePrice")}>
            {moneyFact(p.purchasePrice)}
          </RailFact>
          <RailFact label="Closing costs" empty="Add closing costs" onAdd={() => open("closingCosts")}>
            {moneyFact(p.closingCosts)}
          </RailFact>
          <RailFact label="Rehab amount" empty="Add rehab amount" onAdd={() => open("rehabAmount")}>
            {moneyFact(p.rehabAmount)}
          </RailFact>
          <RailFact label="Refinance date" empty="Add refinance date" onAdd={() => open("refinanceDate")}>
            {dayFact(p.refinanceDate)}
          </RailFact>
          <RailFact label="Refi target" empty="Add refi target" onAdd={() => open("refiTarget")}>
            {textFact(p.refiTarget)}
          </RailFact>
          <RailFact label="Strategy" empty="Add strategy" onAdd={() => open("strategy")}>
            {textFact(p.strategy)}
          </RailFact>
          <RailFact label="Sq ft" empty="Add sq ft" onAdd={() => open("sqft")}>
            {p.sqft != null ? <span className="num">{p.sqft.toLocaleString()}</span> : null}
          </RailFact>
          <RailFact label="Entity" empty="Add entity" onAdd={() => open("llcOwner")}>
            {textFact(p.llcOwner)}
          </RailFact>
          <RailFact label="Attorney" empty="Add attorney" onAdd={() => open("attorney")}>
            {textFact(p.attorney)}
          </RailFact>
          <RailFact label="Status" empty="Add status" onAdd={() => open("status")}>
            {textFact(p.status)}
          </RailFact>
          <RailFact
            label="Rental registration expires"
            empty="Add expiry"
            onAdd={() => open("rentalRegistrationExpiry")}
          >
            {dayFact(p.rentalRegistrationExpiry)}
          </RailFact>
          <RailFact label="Property tax due" empty="Add due date" onAdd={() => open("propertyTaxDueDate")}>
            {dayFact(p.propertyTaxDueDate)}
          </RailFact>
        </RailList>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Details" editing actions={<EditActions formId={formId} pending={pending} onCancel={close} />}>
      <form id={formId} ref={formRef} onSubmit={onSubmit} className="space-y-3">
        <L label="Address">
          <Input name="address" defaultValue={f.address} />
        </L>
        {/* Bottom-aligned, so a field under a two-line label still lines up with its neighbor. */}
        <div className="grid grid-cols-2 items-end gap-3">
          <L label="Value">
            <Input name="value" defaultValue={f.value ?? ""} />
          </L>
          <L label="Purchase date">
            <Input name="purchaseDate" type="date" defaultValue={f.purchaseDate ?? ""} />
          </L>
          <L label="Purchase price">
            <Input name="purchasePrice" defaultValue={f.purchasePrice ?? ""} />
          </L>
          <L label="Closing costs">
            <Input name="closingCosts" defaultValue={f.closingCosts ?? ""} />
          </L>
          <L label="Rehab amount">
            <Input name="rehabAmount" defaultValue={f.rehabAmount ?? ""} />
          </L>
          <L label="Refinance date">
            <Input name="refinanceDate" type="date" defaultValue={f.refinanceDate ?? ""} />
          </L>
          <L label="Refi target">
            <Input name="refiTarget" defaultValue={f.refiTarget ?? ""} />
          </L>
          <L label="Strategy">
            <Select name="strategy" defaultValue={f.strategy ?? ""}>
              <option value="">—</option>
              {[...new Set([f.strategy, ...PROPERTY_STRATEGIES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Sq ft">
            <Input name="sqft" type="number" defaultValue={f.sqft ?? ""} />
          </L>
          <L label="Entity / LLC">
            <Input name="llcOwner" defaultValue={f.llcOwner ?? ""} />
          </L>
          <L label="Attorney">
            <Input name="attorney" defaultValue={f.attorney ?? ""} />
          </L>
          <L label="Status">
            <Select name="status" defaultValue={f.status ?? ""}>
              <option value="">—</option>
              {[...new Set([f.status, ...PROPERTY_STATUSES].filter(Boolean))].map((s) => (
                <option key={s as string}>{s as string}</option>
              ))}
            </Select>
          </L>
          <L label="Rental registration expires">
            <Input name="rentalRegistrationExpiry" type="date" defaultValue={f.rentalRegistrationExpiry ?? ""} />
          </L>
          <L label="Property tax due">
            <Input name="propertyTaxDueDate" type="date" defaultValue={f.propertyTaxDueDate ?? ""} />
          </L>
        </div>
        {error && <SaveError>{error}</SaveError>}
      </form>
    </SectionCard>
  );
}

export function PropertyNotesSection({ id, notes }: { id: string; notes: string | null }) {
  const { loaded: f, open, close, pending, error, onSubmit, formRef } = useSectionSave(id, { notes });
  const formId = `property-notes-${id}`;

  if (!f) {
    return (
      <SectionCard title="Notes" onEdit={open}>
        {notes?.trim() ? (
          <p className="whitespace-pre-wrap text-pretty text-body text-fg-1">{notes}</p>
        ) : (
          <RailVerb onClick={() => open("notes")}>Add a note</RailVerb>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Notes" editing actions={<EditActions formId={formId} pending={pending} onCancel={close} />}>
      <form id={formId} ref={formRef} onSubmit={onSubmit} className="space-y-2">
        <Textarea
          name="notes"
          aria-label="Notes"
          rows={6}
          defaultValue={f.notes ?? ""}
          placeholder="Additional notes on this property…"
        />
        {error && <SaveError>{error}</SaveError>}
      </form>
    </SectionCard>
  );
}
