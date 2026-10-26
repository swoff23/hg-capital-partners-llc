"use client";
import { InlineField } from "@/components/inline-field";
import { patchProperty } from "../actions";
import { onPropertyFieldRequest } from "./edit-field-event";

/** The property page's h1 and its notes: an `InlineField` each, saved through `patchProperty` with the value they loaded. */

export function PropertyAddressHeading({ id, value }: { id: string; value: string }) {
  return (
    <InlineField
      kind="heading"
      label="Address"
      field="address"
      context="Property address"
      value={value}
      minLength={4}
      blank="Enter the address."
      tooShort="Enter the full address, like 123 Main St."
      address={{ kind: "property", excludeId: id }}
      onSave={(address, expected) => patchProperty(id, { address }, { address: expected })}
    />
  );
}

export function PropertyNotes({ id, notes }: { id: string; notes: string | null }) {
  return (
    <InlineField
      kind="multiline"
      label="Notes"
      field="notes"
      context="Property notes"
      value={notes ?? ""}
      empty="Add a note"
      inRail={false}
      onSave={(next, expected) => patchProperty(id, { notes: next }, { notes: expected })}
      onRequest={(open) => onPropertyFieldRequest(["notes"], open)}
    />
  );
}
