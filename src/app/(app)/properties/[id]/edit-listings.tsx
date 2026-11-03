"use client";
import { useEffect, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { AddRow, Button, SaveError, Section, buttonClass, textLinkClass } from "@/components/ui";
import { useLazyModule, warmOnIntent } from "@/components/use-lazy-module";
import { useRun } from "@/components/use-run";
import { OPEN_FAILED_LINE, lazyModule, warmWhenIdle } from "@/lib/lazy-module";
import { cn } from "@/lib/utils";
import { deletePropertyListing } from "../actions";
import type { ListingPhotoDraft } from "./listing-photos";

// The editor (its photo manager and drag and drop included) loads after the page has settled or at the first hover, focus or press, not with the page (lib/lazy-module.ts).
const listingSheet = lazyModule(() => import("./listing-sheet"));

export type EditableListing = {
  id: string | null; // null = not yet saved
  unitLabel: string;
  zillowUrl: string;
  rent: string;
  beds: string;
  baths: string;
  sqft: string;
  availableDate: string; // yyyy-mm-dd or ""
  status: "AVAILABLE" | "LEASED" | "HIDDEN";
  photos: ListingPhotoDraft[]; // order = display/carousel order
};

// A listing's status is a label, not a state, so its word stays neutral (fg-2, as on Portfolio).
export const STATUS_LABEL: Record<EditableListing["status"], string> = {
  AVAILABLE: "Available",
  LEASED: "Leased",
  HIDDEN: "Hidden",
};

function blankListing(): EditableListing {
  return {
    id: null,
    unitLabel: "",
    zillowUrl: "",
    rent: "",
    beds: "",
    baths: "",
    sqft: "",
    availableDate: "",
    status: "HIDDEN",
    photos: [],
  };
}

type Sheet = { index: number | null; version: string; id: number };

/**
 * The rentals (forms 4.2): one row per listing, read at a glance. A row's
 * name, or "Edit listing" in its ⋯ menu, opens that listing in a sheet: its
 * unit, status, photos and facts, saved together as one write at the version
 * the sheet opened at, so a change anyone else made to the property meanwhile
 * refuses it. "Delete listing" asks first and says how many photos go with it.
 */
export function ListingsSection({
  propertyId,
  version,
  initial,
  unitLabels,
}: {
  propertyId: string;
  /** Property.updatedAt the page rendered with; a sheet pins it when it opens, and the save refuses a newer row. */
  version: string;
  initial: EditableListing[];
  /** Unit labels from the Units & access section above: the only valid choices, so the two stay consistent. */
  unitLabels: string[];
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const run = useRun();
  // The code is usually here before the first tap; when it can't be fetched the sheet closes with a toast, and the next tap asks again.
  const editor = useLazyModule(listingSheet, sheet !== null, () => {
    setSheet(null);
    setIsOpen(false);
    run.toast({ message: OPEN_FAILED_LINE });
  });
  useEffect(() => warmWhenIdle(listingSheet), []);
  const noUnits = unitLabels.length === 0;

  function openListing(index: number | null) {
    setSheet({ index, version, id: (sheet?.id ?? 0) + 1 });
    setIsOpen(true);
  }

  const doomed = removing != null ? initial[removing] : null;

  function confirmDelete() {
    if (!doomed?.id) return;
    const id = doomed.id;
    const name = doomed.unitLabel || "the listing";
    run.run(() => deletePropertyListing(propertyId, id, version), {
      failure: "inline",
      succeeded: () => setRemoving(null),
      done: `Listing for ${name} deleted`,
    });
  }

  const editing = sheet?.index != null ? initial[sheet.index] : undefined;

  return (
    <Section title="Rentals">
      {initial.length === 0 ? (
        <p className="pb-2 text-body text-fg-3">No listings yet.</p>
      ) : (
        <ReadListings
          listings={initial}
          onEdit={openListing}
          onDelete={(i) => {
            run.reset();
            setRemoving(i);
          }}
        />
      )}
      <AddRow onClick={() => openListing(null)} onIntent={listingSheet.warm} disabled={noUnits}>
        Add listing
      </AddRow>
      {noUnits && <p className="text-meta text-fg-3">Add a unit in Units &amp; access first.</p>}

      {sheet && editor && (
        <editor.ListingSheet
          key={sheet.id}
          propertyId={propertyId}
          version={sheet.version}
          listing={editing ?? blankListing()}
          unitLabels={unitLabels}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      )}

      {doomed && (
        <ConfirmDialog
          title={`Delete the listing for ${doomed.unitLabel || "this unit"}?`}
          body={doomed.photos.length > 0 ? `Its ${doomed.photos.length} ${doomed.photos.length === 1 ? "photo goes" : "photos go"} too.` : undefined}
          onClose={() => setRemoving(null)}
          cancelLabel="Keep it"
          busy={run.pending}
          actions={
            <Button size="sm" variant="destructive" onClick={confirmDelete} pending={run.pending}>
              Delete listing
            </Button>
          }
        />
      )}
      {doomed && run.error && <SaveError className="mt-2">{run.error}</SaveError>}
    </Section>
  );
}

function ReadListings({
  listings,
  onEdit,
  onDelete,
}: {
  listings: EditableListing[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {listings.map((l, i) => {
        const facts = [l.beds && `${l.beds} bd`, l.baths && `${l.baths} ba`, l.sqft && `${l.sqft} sq ft`].filter(Boolean);
        const name = l.unitLabel || "Unlabeled unit";
        return (
          <li key={l.id ?? i} className="flex min-h-14 items-center gap-3 py-2">
            <PhotoThumb src={l.photos[0]?.url} alt={`${name} listing photo`} size={48} />
            <button
              type="button"
              onClick={() => onEdit(i)}
              {...warmOnIntent(listingSheet)}
              aria-label={`Edit the listing for ${name}`}
              className="min-w-0 flex-1 rounded-md text-left pointer-coarse:min-h-11"
            >
              <p className="truncate text-body text-fg-1">{name}</p>
              <p className="truncate text-meta text-fg-3">
                {/* The status column drops below 480, so its word leads the subline. */}
                <span className="font-medium text-fg-2 min-[480px]:hidden">{STATUS_LABEL[l.status]} · </span>
                {/* Below 480 the secondary clauses drop rather than wrap (section 5 Density). */}
                {l.rent ? (
                  <>
                    <Money value={l.rent} className="text-fg-2" />
                    <span className="max-[480px]:hidden">/mo</span>
                    {facts.length > 0 && <span className="max-[480px]:hidden"> · {facts.join(" · ")}</span>}
                  </>
                ) : facts.length > 0 ? (
                  facts.join(" · ")
                ) : (
                  "No details yet"
                )}
                {l.photos.length > 1 && <span className="max-[480px]:hidden"> · {l.photos.length} photos</span>}
              </p>
            </button>
            {l.zillowUrl && (
              <a
                href={l.zillowUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(textLinkClass, "inline-flex shrink-0 items-center gap-1 text-meta pointer-coarse:min-h-11")}
              >
                Zillow
                <ExternalLink aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5 text-fg-3" />
              </a>
            )}
            {/* The status in one fixed column before the menu, whether or not a Zillow link sits before it. */}
            <span className="w-20 shrink-0 whitespace-nowrap text-meta font-medium text-fg-2 max-[480px]:hidden">{STATUS_LABEL[l.status]}</span>
            <MenuTrigger>
              <AriaButton
                aria-label={`${name} actions`}
                onHoverStart={listingSheet.warm}
                onFocus={listingSheet.warm}
                onPressStart={listingSheet.warm}
                className={buttonClass({ variant: "ghost", size: "sm", icon: true })}
              >
                <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              </AriaButton>
              <Menu sheetTitle={name}>
                <MenuItem icon={<Pencil />} onAction={() => onEdit(i)}>
                  Edit listing
                </MenuItem>
                <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => onDelete(i)}>
                  Delete listing
                </MenuItem>
              </Menu>
            </MenuTrigger>
          </li>
        );
      })}
    </ul>
  );
}

