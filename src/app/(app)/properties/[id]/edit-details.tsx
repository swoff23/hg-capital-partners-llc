"use client";
import { RailFold } from "@/components/rail-fold";
import { Section } from "@/components/ui";
import { PROPERTY_STATUSES, PROPERTY_STRATEGIES } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
import { ENTITY_NAMES } from "@/lib/quickbooks/entities";
import type { OptionItem } from "@/components/option-list";
import { PropertyStatus } from "../property-status";
import { PropertyAddressHeading, PropertyNotes } from "./property-heading";
import { onPropertyFieldRequest, openPropertyField } from "./edit-field-event";
import { PropertyFact, PropertyKeyDate, PropertyMoveInSwitch, isBlank as blank } from "./property-fact";

export type EditableProperty = {
  id: string;
  address: string;
  llcOwner: string | null;
  attorney: string | null;
  status: string | null;
  /** Offered on the public move-in form. */
  showOnMoveInForm: boolean;
  strategy: string | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  value: string | null;
  refinanceDate: string | null;
  sqft: number | null;
  rentalRegistrationExpiry: string | null;
  propertyTaxDueDate: string | null;
};

/**
 * A list of words as picker rows, always in the list's order. A stored value
 * the list doesn't have (a name typed before Entity was a list) leads as its
 * own row, so opening never changes it.
 */
const rows = (words: readonly string[], stored: string | null): OptionItem[] =>
  (stored && !words.includes(stored) ? [stored, ...words] : [...words]).map((w) => ({ id: w, label: w }));

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
 * changed where it stands. Money, dates, a count and three lists (Strategy,
 * Entity, Status); the empty ones fold behind "N more fields"
 * (docs/specs/property-page.md 2.2), except the move-in switch and the two
 * reminder dates, which always show. The fact strip's "Add value" opens
 * Value, unfolding it first. Entity is one of the five companies
 * (ENTITY_NAMES); a name stored before the list stays as its own row.
 */
export function PropertyDetailsSection({ property: p }: { property: EditableProperty }) {
  const context = `Details · ${shortAddress(p.address) || p.address}`;
  const common = { id: p.id, context };
  return (
    <Section title="Details">
      <RailFold
        listen={onPropertyFieldRequest}
        reopen={openPropertyField}
        rows={[
          {
            key: "value",
            empty: blank(p.value),
            node: <PropertyFact {...common} field="value" label="Value" anchor="value" kind="money" value={p.value} empty="Add value" />,
          },
          {
            key: "purchaseDate",
            empty: blank(p.purchaseDate),
            node: <PropertyFact {...common} field="purchaseDate" label="Purchase date" kind="date" value={p.purchaseDate} empty="Add purchase date" />,
          },
          {
            key: "purchasePrice",
            empty: blank(p.purchasePrice),
            node: <PropertyFact {...common} field="purchasePrice" label="Purchase price" kind="money" value={p.purchasePrice} empty="Add purchase price" />,
          },
          {
            key: "refinanceDate",
            empty: blank(p.refinanceDate),
            node: <PropertyFact {...common} field="refinanceDate" label="Refinance date" kind="date" value={p.refinanceDate} empty="Add refinance date" />,
          },
          {
            key: "strategy",
            empty: blank(p.strategy),
            node: (
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
            ),
          },
          {
            key: "sqft",
            empty: blank(p.sqft),
            node: <PropertyFact {...common} field="sqft" label="Sq ft" kind="integer" unit="sq ft" value={p.sqft == null ? "" : String(p.sqft)} empty="Add sq ft" />,
          },
          {
            key: "llcOwner",
            empty: blank(p.llcOwner),
            node: (
              <PropertyFact
                {...common}
                field="llcOwner"
                label="Entity"
                kind="choice"
                value={p.llcOwner}
                empty="Add entity"
                options={rows(ENTITY_NAMES, p.llcOwner)}
                emptyLabel="Not set"
              />
            ),
          },
          {
            key: "attorney",
            empty: blank(p.attorney),
            node: <PropertyFact {...common} field="attorney" label="Attorney" kind="text" value={p.attorney} empty="Add attorney" />,
          },
          {
            key: "status",
            empty: blank(p.status),
            node: (
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
            ),
          },
          { key: "showOnMoveInForm", empty: false, keep: true, node: <PropertyMoveInSwitch id={p.id} shown={p.showOnMoveInForm} /> },
          {
            key: "rentalRegistrationExpiry",
            empty: blank(p.rentalRegistrationExpiry),
            keep: true,
            // Rail labels fit 96px on a phone on one line: shorter words, not a smaller font.
            node: (
              <PropertyKeyDate
                {...common}
                field="rentalRegistrationExpiry"
                label="Registration"
                name="Registration expiry"
                date={p.rentalRegistrationExpiry}
                addLabel="Add expiry"
                leadDays={30}
              />
            ),
          },
          {
            key: "propertyTaxDueDate",
            empty: blank(p.propertyTaxDueDate),
            keep: true,
            node: <PropertyKeyDate {...common} field="propertyTaxDueDate" label="Tax due" name="Tax due date" date={p.propertyTaxDueDate} addLabel="Add due date" leadDays={21} />,
          },
        ]}
      />
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
