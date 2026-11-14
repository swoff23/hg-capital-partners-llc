"use client";
import { Plus } from "lucide-react";
import { RecordMoreMenu } from "@/components/record-archive";
import { setPropertyArchived } from "../actions";
import { openPropertyField } from "./edit-field-event";
import { NEW_LISTING } from "./edit-listings";

/**
 * The property's ⋯ menu in its header: Copy link and Archive, and "Add
 * listing" while a live property has units but no listing, since Rental
 * listings isn't on the page until it has one (docs/specs/property-page.md
 * 2.3). It opens the same sheet as the section's own row.
 */
export function PropertyMoreMenu({ id, archived, canAddListing }: { id: string; archived: boolean; canAddListing: boolean }) {
  return (
    <RecordMoreMenu
      kind="property"
      id={id}
      href={`/properties/${id}`}
      archived={archived}
      action={setPropertyArchived}
      actions={canAddListing ? [{ label: "Add listing", icon: <Plus />, onAction: () => openPropertyField(NEW_LISTING) }] : undefined}
    />
  );
}
