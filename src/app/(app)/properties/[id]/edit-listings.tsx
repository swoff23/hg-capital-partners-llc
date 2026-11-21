"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ListingStatus } from "@prisma/client";
import { Button as AriaButton } from "react-aria-components";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { AddRow, Button, SaveError, Section, buttonClass, sheetWaitingFill, textLinkClass } from "@/components/ui";
import { useLazyModule, warmOnIntent } from "@/components/use-lazy-module";
import { useRun } from "@/components/use-run";
import { lazyModule, openFailedToast, warmWhenIdle } from "@/lib/lazy-module";
import { deleteListingBody, waitingClause, type WaitlistRow } from "@/lib/waitlist/fields";
import { cn } from "@/lib/utils";
import { deletePropertyListing } from "../actions";
import { onPropertyFieldRequest } from "./edit-field-event";
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
  status: ListingStatus;
  photos: ListingPhotoDraft[]; // order = display/carousel order
};

// A listing's status is a label, not a state, so its word stays neutral (fg-2, as on Portfolio).
export const STATUS_LABEL: Record<ListingStatus, string> = {
  AVAILABLE: "Available",
  COMING_SOON: "Coming soon",
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

/** The sheet that is up: the listing it edits by id (null for a new one, so a listing added or deleted elsewhere never moves it onto another), the version it opened at, and a fresh `id` per open. */
type Sheet = { listingId: string | null; version: string; id: number };

/** What the header's ⋯ "Add listing" asks for (openPropertyField), while the section isn't on the page. */
export const NEW_LISTING = "newListing";

/**
 * Rental listings (forms 4.2): one row per listing, read at a glance. A row's
 * name, or "Edit listing" in its ⋯ menu, opens that listing in a sheet: its
 * unit, status, photos and facts, saved together as one write at the version
 * the sheet opened at, so a change anyone else made to the property meanwhile
 * refuses it. "Delete listing" asks first and says what goes with it: its
 * photos and the people waiting on it (coming-soon.md 3.5). The sign-up list
 * is read-only here: it rides beside the listings, never in the draft.
 *
 * The section shows only once the property has a listing
 * (docs/specs/property-page.md 2.3). Until then nothing of it is on the page
 * but the sheet, which the header's ⋯ "Add listing" opens (NEW_LISTING).
 */
export function ListingsSection({
  propertyId,
  version,
  initial,
  waitlists,
  street,
  unitLabels,
}: {
  propertyId: string;
  /** Property.updatedAt the page rendered with; a sheet pins it when it opens, and the save refuses a newer row. */
  version: string;
  initial: EditableListing[];
  /** Each saved listing's sign-ups by listing id, newest first. */
  waitlists: Record<string, WaitlistRow[]>;
  /** The property's street ("56 Tamarack St"), which names the Download's file. */
  street: string;
  /** Unit labels from the Units & access section above: the only valid choices, so the two stay consistent. */
  unitLabels: string[];
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const run = useRun();
  // The code is usually here before the first tap; when it can't be fetched the sheet closes with a toast whose Reload
  // brings it back, whatever the cause (lib/lazy-module.ts).
  const editor = useLazyModule(listingSheet, sheet !== null, () => {
    setSheet(null);
    setIsOpen(false);
    run.toast(openFailedToast());
  });
  useEffect(() => warmWhenIdle(listingSheet), []);
  const noUnits = unitLabels.length === 0;

  function openListing(index: number | null) {
    setSheet({ listingId: index == null ? null : (initial[index]?.id ?? null), version, id: (sheet?.id ?? 0) + 1 });
    setIsOpen(true);
  }

  // The header's ⋯ "Add listing": the same sheet as the section's own row.
  useEffect(() =>
    onPropertyFieldRequest([NEW_LISTING], () => {
      listingSheet.warm();
      openListing(null);
    }),
  );

  const doomed = removing != null ? initial[removing] : null;
  const doomedWaiting = (doomed?.id && waitlists[doomed.id]) || [];

  function confirmDelete() {
    if (!doomed?.id) return;
    const id = doomed.id;
    const name = doomed.unitLabel || "the listing";
    run.run(() => deletePropertyListing(propertyId, id, version, doomedWaiting.length), {
      failure: "inline",
      succeeded: () => setRemoving(null),
      done: `Listing for ${name} deleted`,
    });
  }

  const editing = sheet?.listingId != null ? initial.find((l) => l.id === sheet.listingId) : undefined;
  // Tapped and its code is still on the way: that row (or Add listing) takes the fill a tapped list row takes. Read
  // from the shared store, not the hook, which only notices code that came in while idle one render after the tap.
  const waitingFor = sheet !== null && !editor && listingSheet.loaded() === null ? sheet : null;

  // The sheet sits beside the section, not in it, so it stays the same sheet while the first listing saves and the
  // section appears: it slides out instead of being remounted.
  return (
    <>
      {initial.length > 0 && (
        <Section title="Rental listings">
          <ReadListings
            listings={initial}
            waitlists={waitlists}
            waitingId={waitingFor && waitingFor.listingId}
            onEdit={openListing}
            onDelete={(i) => {
              run.reset();
              setRemoving(i);
            }}
          />
          <AddRow onClick={() => openListing(null)} onIntent={listingSheet.warm} disabled={noUnits} waiting={waitingFor !== null && waitingFor.listingId === null}>
            Add listing
          </AddRow>
          {noUnits && <p className="text-meta text-muted-foreground">Add a unit in Units &amp; access first.</p>}
          {doomed && run.error && <SaveError className="mt-2">{run.error}</SaveError>}
        </Section>
      )}

      {sheet && editor && (
        <editor.ListingSheet
          key={sheet.id}
          propertyId={propertyId}
          version={sheet.version}
          latest={version}
          listing={editing ?? blankListing()}
          waitlist={(editing?.id && waitlists[editing.id]) || []}
          street={street}
          gone={sheet.listingId !== null && !editing}
          unitLabels={unitLabels}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      )}

      {doomed && (
        <ConfirmDialog
          title={`Delete the listing for ${doomed.unitLabel || "this unit"}?`}
          body={deleteListingBody(doomed.photos.length, doomedWaiting)}
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
    </>
  );
}

/** Tailwind's `max-[480px]`, the width the row's status column and secondary clauses drop below. */
const NARROW = "(max-width: 479.98px)";

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True below 480; false during server render and hydration, which is fine for a menu that only opens on a tap. */
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

function ReadListings({
  listings,
  waitlists,
  waitingId,
  onEdit,
  onDelete,
}: {
  listings: EditableListing[];
  waitlists: Record<string, WaitlistRow[]>;
  /** The listing whose sheet's code is still arriving after its tap; null or undefined when none is. */
  waitingId?: string | null;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  // Below 480 the Zillow link moves from the row into its ⋯ menu, so the subline keeps "3 waiting"
  // (docs/specs/coming-soon.md 3.5; Connor, Nov 21).
  const narrow = useNarrow();
  return (
    <ul className="divide-y divide-border">
      {listings.map((l, i) => {
        const facts = [l.beds && `${l.beds} bd`, l.baths && `${l.baths} ba`, l.sqft && `${l.sqft} sq ft`].filter(Boolean);
        const name = l.unitLabel || "Unlabeled unit";
        const waiting = waitingClause((l.id && waitlists[l.id]?.length) || 0);
        return (
          <li key={l.id ?? i} className="flex min-h-14 items-center gap-3 py-2">
            <PhotoThumb src={l.photos[0]?.url} alt={`${name} listing photo`} size={48} />
            <button
              type="button"
              onClick={() => onEdit(i)}
              {...warmOnIntent(listingSheet)}
              aria-label={`Edit the listing for ${name}`}
              aria-busy={l.id === waitingId || undefined}
              className={cn("-mx-2 min-w-0 flex-1 rounded-md px-2 text-left transition-colors pointer-coarse:min-h-11", l.id === waitingId && sheetWaitingFill)}
            >
              <p className="truncate text-body text-foreground">{name}</p>
              <p className="truncate text-meta text-muted-foreground">
                {/* The status column drops below 480, so its word leads the subline. */}
                <span className="font-medium text-fg-2 min-[480px]:hidden">{STATUS_LABEL[l.status]} · </span>
                {/* Narrow, the count leads the rent ("Coming soon · 3 waiting · $1,450"); wide, it follows it. */}
                {waiting && (
                  <span className="min-[480px]:hidden">
                    {waiting}
                    {(l.rent || facts.length > 0) && " · "}
                  </span>
                )}
                {/* Below 480 the secondary clauses drop rather than wrap (section 5 Density). */}
                {l.rent ? (
                  <>
                    <Money value={l.rent} className="text-fg-2" />
                    <span className="max-[480px]:hidden">/mo</span>
                    {waiting && <span className="max-[480px]:hidden"> · {waiting}</span>}
                    {facts.length > 0 && <span className="max-[480px]:hidden"> · {facts.join(" · ")}</span>}
                  </>
                ) : (
                  <>
                    {waiting && <span className="max-[480px]:hidden">{waiting}{facts.length > 0 && " · "}</span>}
                    {facts.length > 0 ? facts.join(" · ") : !waiting && "No details yet"}
                  </>
                )}
                {l.photos.length > 1 && <span className="max-[480px]:hidden"> · {l.photos.length} photos</span>}
              </p>
            </button>
            {l.zillowUrl && (
              <a
                href={l.zillowUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(textLinkClass, "inline-flex shrink-0 items-center gap-1 text-meta pointer-coarse:min-h-11 max-[480px]:hidden")}
              >
                Zillow
                <ExternalLink aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            )}
            {/* The status in one fixed column before the menu, whether or not a Zillow link sits before it. */}
            <span className="w-24 shrink-0 whitespace-nowrap text-meta font-medium text-fg-2 max-[480px]:hidden">{STATUS_LABEL[l.status]}</span>
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
                {narrow && l.zillowUrl && (
                  <MenuItem icon={<ExternalLink />} href={l.zillowUrl} target="_blank" rel="noopener noreferrer">
                    View on Zillow
                  </MenuItem>
                )}
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

