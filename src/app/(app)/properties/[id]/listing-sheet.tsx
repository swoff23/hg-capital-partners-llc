"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/date-field";
import { FormSheet } from "@/components/form-sheet";
import { LoadLatest } from "@/components/load-latest";
import { NumberInput } from "@/components/number-input";
import { Select } from "@/components/select";
import { FormField, Input } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { stableJson } from "@/lib/drafts";
import { listingProblems } from "@/lib/properties/listing-checks";
import { loadLatestListing } from "@/lib/properties/listing-latest";
import { savePropertyListing } from "../actions";
import { STATUS_LABEL, type EditableListing } from "./edit-listings";
import { LISTING_PHOTO_MAX, ListingPhotos, discardSessionUploads } from "./listing-photos";

/**
 * The listing editor's sheet. It opens on a tap and carries the photo manager
 * (drag and drop included), so the Rentals section loads it with the first
 * open instead of with the page (edit-listings.tsx).
 */

const STATUS_ITEMS = (["HIDDEN", "AVAILABLE", "LEASED"] as const).map((id) => ({ id, label: STATUS_LABEL[id] }));

/**
 * One listing in a sheet (forms 4.2, 2.9): unit and status, the photos, the
 * link, when it's available, the rent and the rest. Save applies the fields
 * and the photo set together. While photos upload, Save waits and one line
 * beside it says how many ("2 photos uploading"); its label never changes.
 * Refused because the property moved on (any fact on it, not only this
 * listing), "Load the latest" moves the save to the page's version and keeps
 * the draft and its photos; only a listing that changed itself starts over
 * on the new one (lib/properties/listing-latest.ts).
 */
export function ListingSheet({
  propertyId,
  version,
  latest,
  listing,
  gone,
  unitLabels,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  /** The version the sheet opened at; the save is refused once the property has moved on. */
  version: string;
  /** The page's version now: after a refusal the page re-renders on the latest, and "Load the latest" pins this. */
  latest: string;
  /** The listing as the page holds it now. */
  listing: EditableListing;
  /** The listing was deleted elsewhere: the latest has nothing to load. */
  gone: boolean;
  unitLabels: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isNew = listing.id === null;
  // The listing as the sheet last loaded it, and the version its save is checked against: both move on with "Load the latest".
  const [base, setBase] = useState<EditableListing>(() => structuredClone(listing));
  const [pinned, setPinned] = useState(version);
  const [draft, setDraft] = useState<EditableListing>(() => structuredClone(listing));
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [uploading, setUploading] = useState(0);
  const run = useRun();
  const router = useRouter();

  // Include the listing's current label even if it's since been renamed or removed from Units & access,
  // so an existing pick never silently disappears.
  const unitItems = [...new Set([listing.unitLabel, ...unitLabels].filter(Boolean))].map((u) => ({ id: u, label: u }));
  const name = draft.unitLabel || "New listing";
  // A field shows its line once it was left or Save was pressed (lib/properties/listing-checks.ts).
  const problems = listingProblems(draft, listing);
  const shows = (field: string) => (tried || left.has(field)) && problems[field] ? problems[field] : undefined;
  const serverError = (field: string) => run.fieldErrors?.[field];
  const leave = (field: string) => setLeft((s) => new Set(s).add(field));

  function change(patch: Partial<EditableListing>) {
    run.reset();
    setDraft((d) => ({ ...d, ...patch }));
  }

  function submit() {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    const photos = draft.photos;
    run.run(() => savePropertyListing(propertyId, draft, pinned), {
      failure: "inline",
      succeeded: () => {
        // Photos uploaded and then removed before this Save go; the saved set stays.
        void discardSessionUploads(propertyId, photos);
        onOpenChange(false);
      },
      done: isNew ? `Listing for ${draft.unitLabel} added` : `Listing for ${draft.unitLabel} saved`,
      key: `listing:${propertyId}:${draft.id ?? "new"}`,
    });
  }

  function loadLatest() {
    run.reset();
    if (gone) {
      void discardSessionUploads(propertyId);
      onOpenChange(false);
      return;
    }
    const next = loadLatestListing(base, listing, draft);
    setBase(next.base);
    setPinned(latest);
    if (next.reset) {
      // The listing itself changed: the photos uploaded here belong to a draft that is gone, and go when the sheet closes or saves.
      setDraft(next.draft);
      setTried(false);
      setLeft(new Set());
    }
    // In case the refusal's page didn't arrive with it; when it did, this is the same latest.
    router.refresh();
  }

  return (
    <FormSheet
      title={isNew ? "New listing" : name}
      isOpen={isOpen}
      onOpenChange={(open) => {
        // Discard, Cancel, X or Esc: the photos this sheet uploaded go with the changes (G1D-026).
        if (!open) void discardSessionUploads(propertyId);
        onOpenChange(open);
      }}
      onSubmit={submit}
      primary={isNew ? "Add listing" : "Save listing"}
      pending={run.pending}
      primaryDisabled={uploading > 0}
      disabledReason={uploading > 0 ? `${uploading} ${uploading === 1 ? "photo" : "photos"} uploading` : undefined}
      values={draft}
      // Against what the sheet last loaded, so loading the latest doesn't read as a change of yours.
      dirty={stableJson(draft) !== stableJson(base)}
      size="lg"
      fullHeight
      discardTitle={isNew ? "Discard the new listing?" : `Discard changes to the listing for ${name}?`}
      leaveTitle={`Leave the ${name} listing?`}
      error={run.error && Object.keys(run.fieldErrors ?? {}).length === 0 ? run.error : undefined}
      errorAction={run.conflict && <LoadLatest onClick={loadLatest} />}
      fieldErrors={run.fieldErrors}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Unit"
          items={unitItems}
          value={draft.unitLabel || null}
          placeholder="Choose a unit"
          onChange={(v) => change({ unitLabel: v ?? "" })}
          isInvalid={!!shows("unitLabel")}
          errorMessage={shows("unitLabel")}
        />
        <Select
          label="Status"
          items={STATUS_ITEMS}
          value={draft.status}
          onChange={(v) => change({ status: (v ?? "HIDDEN") as EditableListing["status"] })}
        />
      </div>

      <ListingPhotos
        propertyId={propertyId}
        name={name}
        value={draft.photos}
        onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
        max={LISTING_PHOTO_MAX}
        onPendingChange={setUploading}
      />

      <FormField label="Zillow link" optional error={shows("zillowUrl") ?? serverError("zillowUrl")}>
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            value={draft.zillowUrl}
            onBlur={() => leave("zillowUrl")}
            onChange={(e) => change({ zillowUrl: e.target.value })}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-meta font-medium text-fg-2">
            Available from<span className="font-normal text-fg-3"> (optional)</span>
          </span>
          <DateField label="Available from" value={draft.availableDate || null} onChange={(v) => change({ availableDate: v ?? "" })} />
        </div>
        <FormField label="Rent" optional error={shows("rent") ?? serverError("rent")}>
          {(p) => (
            <NumberInput kind="money" suffix="/mo" {...p} value={draft.rent} onBlur={() => leave("rent")} onChange={(v) => change({ rent: v })} />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Sq ft" optional error={shows("sqft") ?? serverError("sqft")}>
          {(p) => <NumberInput kind="integer" {...p} value={draft.sqft} onBlur={() => leave("sqft")} onChange={(v) => change({ sqft: v })} />}
        </FormField>
        <FormField label="Beds" optional error={shows("beds")}>
          {(p) => <NumberInput kind="integer" {...p} value={draft.beds} onBlur={() => leave("beds")} onChange={(v) => change({ beds: v })} />}
        </FormField>
        <FormField label="Baths" optional error={shows("baths")}>
          {(p) => <NumberInput kind="decimal" {...p} value={draft.baths} onBlur={() => leave("baths")} onChange={(v) => change({ baths: v })} />}
        </FormField>
      </div>
    </FormSheet>
  );
}
