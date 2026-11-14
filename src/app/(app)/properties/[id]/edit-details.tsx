"use client";
import { RailFold } from "@/components/rail-fold";
import { Section } from "@/components/ui";
import { PROPERTY_STATUSES } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
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
  purchaseDate: string | null;
  purchasePrice: string | null;
  value: string | null;
  refinanceDate: string | null;
  sqft: number | null;
  beds: number | null;
  /** Baths as stored, "1.50"; it reads "1.5". */
  baths: string | null;
  rentalRegistrationExpiry: string | null;
  propertyTaxDueDate: string | null;
};

/**
 * A list of words as picker rows, always in the list's order. A stored value
 * the list doesn't have (a company no longer offered, like 58 Mariner's BMK)
 * leads as its own row, so opening never changes it.
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
 * Details (forms 4.2): the facts of the purchase and the dates, each changed
 * where it stands. Value, the purchase, the refinance, beds, baths, square
 * feet and Entity always show; Attorney, Status, the move-in switch and the two reminder
 * dates fold behind "5 more fields", filled or not
 * (docs/specs/property-page.md 2.2). Entity searches the companies and the
 * names added on any property (`entities`, lib/properties/entity.ts), and
 * typing a new one adds it; a stored name off the list stays as its own row.
 */
export function PropertyDetailsSection({ property: p, entities }: { property: EditableProperty; entities: readonly string[] }) {
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
            keep: true,
            node: <PropertyFact {...common} field="value" label="Value" anchor="value" kind="money" value={p.value} empty="Add value" />,
          },
          {
            key: "purchaseDate",
            empty: blank(p.purchaseDate),
            keep: true,
            node: <PropertyFact {...common} field="purchaseDate" label="Purchase date" kind="date" value={p.purchaseDate} empty="Add purchase date" />,
          },
          {
            key: "purchasePrice",
            empty: blank(p.purchasePrice),
            keep: true,
            node: <PropertyFact {...common} field="purchasePrice" label="Purchase price" kind="money" value={p.purchasePrice} empty="Add purchase price" />,
          },
          {
            key: "refinanceDate",
            empty: blank(p.refinanceDate),
            keep: true,
            node: <PropertyFact {...common} field="refinanceDate" label="Refinance date" kind="date" value={p.refinanceDate} empty="Add refinance date" />,
          },
          {
            key: "beds",
            empty: blank(p.beds),
            keep: true,
            node: <PropertyFact {...common} field="beds" label="Beds" kind="integer" value={p.beds == null ? "" : String(p.beds)} empty="Add beds" />,
          },
          {
            key: "baths",
            empty: blank(p.baths),
            keep: true,
            node: <PropertyFact {...common} field="baths" label="Baths" kind="decimal" value={p.baths} empty="Add baths" />,
          },
          {
            key: "sqft",
            empty: blank(p.sqft),
            keep: true,
            node: <PropertyFact {...common} field="sqft" label="Square feet" kind="integer" unit="sq ft" value={p.sqft == null ? "" : String(p.sqft)} empty="Add square feet" />,
          },
          {
            key: "llcOwner",
            empty: blank(p.llcOwner),
            keep: true,
            node: (
              <PropertyFact
                {...common}
                field="llcOwner"
                label="Entity"
                kind="choice"
                value={p.llcOwner}
                empty="Add entity"
                options={rows(entities, p.llcOwner)}
                emptyLabel="Not set"
                allowAdd
              />
            ),
          },
          {
            key: "attorney",
            empty: blank(p.attorney),
            fold: true,
            node: <PropertyFact {...common} field="attorney" label="Attorney" kind="text" value={p.attorney} empty="Add attorney" />,
          },
          {
            key: "status",
            empty: blank(p.status),
            fold: true,
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
          { key: "showOnMoveInForm", empty: false, fold: true, node: <PropertyMoveInSwitch id={p.id} shown={p.showOnMoveInForm} /> },
          {
            key: "rentalRegistrationExpiry",
            empty: blank(p.rentalRegistrationExpiry),
            fold: true,
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
            fold: true,
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
