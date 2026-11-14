"use client";
import { ImagePlus, Plus } from "lucide-react";
import type { RecordMenuAction } from "@/components/record-archive";
import { RecordMoreMenu } from "@/components/record-archive";
import { setPropertyArchived } from "../actions";
import { openPropertyField } from "./edit-field-event";
import { NEW_LISTING } from "./edit-listings";
import { ADD_PHOTO } from "./property-photo";

/**
 * The property's ⋯ menu in its header: Copy link and Archive; "Add
 * listing" while a live property has units but no listing, since Rental
 * listings isn't on the page until it has one (docs/specs/property-page.md
 * 2.3), opening the same sheet as the section's own row; and "Add photo"
 * while it has no photo, since the header shows no tile until one is set.
 */
export function PropertyMoreMenu({
  id,
  archived,
  canAddListing,
  canAddPhoto,
}: {
  id: string;
  archived: boolean;
  canAddListing: boolean;
  canAddPhoto: boolean;
}) {
  const actions: RecordMenuAction[] = [
    ...(canAddListing ? [{ label: "Add listing", icon: <Plus />, onAction: () => openPropertyField(NEW_LISTING) }] : []),
    ...(canAddPhoto ? [{ label: "Add photo", icon: <ImagePlus />, onAction: () => openPropertyField(ADD_PHOTO) }] : []),
  ];
  return (
    <RecordMoreMenu
      kind="property"
      id={id}
      href={`/properties/${id}`}
      archived={archived}
      action={setPropertyArchived}
      actions={actions.length ? actions : undefined}
    />
  );
}
