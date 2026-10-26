"use client";
import { RailList } from "@/components/rail";
import { Section } from "@/components/ui";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
import type { OptionItem } from "@/components/option-list";
import { PropertyStatus } from "../property-status";
import { PropertyAddressHeading, PropertyNotes } from "./property-heading";
import { PropertyFact, PropertyKeyDate } from "./property-fact";

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

/** A list of words as picker rows, with a stored value the list no longer has kept as its own row (so opening never changes it). */
const rows = (words: readonly string[], stored: string | null): OptionItem[] =>
  [...new Set([stored, ...words].filter((w): w is string => !!w))].map((w) => ({ id: w, label: w }));

/**
 * The page's h1: the address, edited in place with suggestions and the
 * duplicate line, on touch in a one-field sheet. Sent with the address it
 * replaces, so a rename someone else saved meanwhile isn't overwritten; a
 * refused save or a dropped connection reopens the field with what was typed.
 */
export function PropertyAddressField({ id, value }: { id: string; value: string }) {
  return <PropertyAddressHeading id={id} value={value} />;
}

/**
 * Details (forms 4.2): the facts of the purchase, the plan and the dates, each
 * changed where it stands. Money, dates, a count and two lists; the empty ones
 * are verbs ("Add purchase price"). The fact strip's "Add value" opens Value.
 */
export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const context = `Details · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  return (
    <Section title="Details">
      <RailList>
        <PropertyFact {...common} field="value" label="Value" anchor="value" kind="money" value={p.value} empty="Add value" />
        <PropertyFact {...common} field="purchaseDate" label="Purchase date" kind="date" value={p.purchaseDate} empty="Add purchase date" />
        <PropertyFact {...common} field="purchasePrice" label="Purchase price" kind="money" value={p.purchasePrice} empty="Add purchase price" />
        <PropertyFact {...common} field="closingCosts" label="Closing costs" kind="money" value={p.closingCosts} empty="Add closing costs" />
        <PropertyFact {...common} field="rehabAmount" label="Rehab amount" kind="money" value={p.rehabAmount} empty="Add rehab amount" />
        <PropertyFact {...common} field="refinanceDate" label="Refinance date" kind="date" value={p.refinanceDate} empty="Add refinance date" />
        <PropertyFact {...common} field="refiTarget" label="Refi target" kind="text" value={p.refiTarget} empty="Add refi target" />
        <PropertyFact
          {...common}
          field="strategy"
          label="Strategy"
          kind="choice"
          value={p.strategy}
          empty="Add strategy"
          options={rows(PROPERTY_STRATEGIES, p.strategy)}
          emptyLabel="Not set"
        />
        <PropertyFact {...common} field="sqft" label="Sq ft" kind="integer" unit="sq ft" value={p.sqft == null ? "" : String(p.sqft)} empty="Add sq ft" />
        <PropertyFact {...common} field="llcOwner" label="Entity" kind="text" value={p.llcOwner} empty="Add entity" />
        <PropertyFact {...common} field="attorney" label="Attorney" kind="text" value={p.attorney} empty="Add attorney" />
        <PropertyFact
          {...common}
          field="status"
          label="Status"
          kind="choice"
          value={p.status}
          empty="Add status"
          options={rows(PROPERTY_STATUSES, p.status)}
          emptyLabel="Not set"
          display={(text) => <PropertyStatus status={text} />}
        />
        {/* Rail labels fit 96px on a phone on one line: shorter words, not a smaller font. */}
        <PropertyKeyDate
          {...common}
          field="rentalRegistrationExpiry"
          label="Registration"
          name="Registration expiry"
          date={p.rentalRegistrationExpiry}
          addLabel="Add expiry"
          leadDays={30}
        />
        <PropertyKeyDate {...common} field="propertyTaxDueDate" label="Tax due" name="Tax due date" date={p.propertyTaxDueDate} addLabel="Add due date" leadDays={21} />
      </RailList>
    </Section>
  );
}

/**
 * The notes (forms 4.2): autosizing, saved with Save or ⌘↵, never on blur, so
 * a stray tap can't rewrite them, and a change confirms with Undo. The verb
 * "Add a note" stays.
 */
export function PropertyNotesSection({ id, notes }: { id: string; notes: string | null }) {
  return (
    <Section title="Notes">
      <PropertyNotes id={id} notes={notes} />
    </Section>
  );
}
