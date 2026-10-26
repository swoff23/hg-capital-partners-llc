"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button as AriaButton } from "react-aria-components";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateField } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { NumberInput, numberProblem } from "@/components/number-input";
import { PhotoThumb } from "@/components/photo-thumb";
import { Select } from "@/components/select";
import { AddRow, Button, FormField, Input, SaveError, Section, buttonClass, textLinkClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { inlineProblem } from "@/lib/inline-edit";
import { cn } from "@/lib/utils";
import { deletePropertyListing, savePropertyListing } from "../actions";

export type EditablePhoto = { url: string; pathname: string };

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
  photos: EditablePhoto[]; // order = display/carousel order
};

/** The most photos a listing holds (the server's cap). */
const MAX_PHOTOS = 20;

// A listing's status is a label, not a state, so its word stays neutral (fg-2, as on Portfolio).
const STATUS_LABEL: Record<EditableListing["status"], string> = {
  AVAILABLE: "Available",
  LEASED: "Leased",
  HIDDEN: "Hidden",
};

const STATUS_ITEMS = (["HIDDEN", "AVAILABLE", "LEASED"] as const).map((id) => ({ id, label: STATUS_LABEL[id] }));

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
      <AddRow onClick={() => openListing(null)} disabled={noUnits}>
        Add listing
      </AddRow>
      {noUnits && <p className="text-meta text-fg-3">Add a unit in Units &amp; access first.</p>}

      {sheet && (
        <ListingSheet
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
              <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
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

/* ---------------- The listing's sheet ---------------- */

/** The fields a sheet checks, by name. A field shows its line once it was left or Save was pressed. */
function problemsOf(l: EditableListing, original: EditableListing): Record<string, string> {
  const found: Record<string, string> = {};
  if (!l.unitLabel.trim()) found.unitLabel = "Choose a unit.";
  const url = inlineProblem("url", l.zillowUrl);
  if (url) found.zillowUrl = url;
  const rent = numberProblem("money", l.rent);
  if (rent) found.rent = rent;
  const sqft = numberProblem("integer", l.sqft);
  if (sqft) found.sqft = sqft;
  // A bed or bath count already stored ("Studio") is left as it is until someone types over it.
  const beds = l.beds !== original.beds ? numberProblem("integer", l.beds) : null;
  if (beds) found.beds = beds;
  const baths = l.baths !== original.baths ? numberProblem("decimal", l.baths) : null;
  if (baths) found.baths = baths;
  return found;
}

/**
 * One listing in a sheet (forms 4.2, 2.9): unit and status, the photos, the
 * link, when it's available, the rent and the rest. Save applies the fields
 * and the photo set together. While photos upload, Save waits and one line
 * beside it says how many ("2 photos uploading"); its label never changes.
 */
function ListingSheet({
  propertyId,
  version,
  listing,
  unitLabels,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  version: string;
  listing: EditableListing;
  unitLabels: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isNew = listing.id === null;
  const [draft, setDraft] = useState<EditableListing>(() => structuredClone(listing));
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [uploading, setUploading] = useState(0);
  const run = useRun();

  // Include the listing's current label even if it's since been renamed or removed from Units & access,
  // so an existing pick never silently disappears.
  const unitItems = [...new Set([listing.unitLabel, ...unitLabels].filter(Boolean))].map((u) => ({ id: u, label: u }));
  const name = draft.unitLabel || "New listing";
  const problems = problemsOf(draft, listing);
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
    run.run(() => savePropertyListing(propertyId, draft, version), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: isNew ? `Listing for ${draft.unitLabel} added` : `Listing for ${draft.unitLabel} saved`,
      key: `listing:${propertyId}:${draft.id ?? "new"}`,
    });
  }

  return (
    <FormSheet
      title={isNew ? "New listing" : name}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={isNew ? "Add listing" : "Save listing"}
      pending={run.pending}
      primaryDisabled={uploading > 0}
      disabledReason={uploading > 0 ? `${uploading} ${uploading === 1 ? "photo" : "photos"} uploading` : undefined}
      values={draft}
      size="lg"
      fullHeight
      discardTitle={isNew ? "Discard the new listing?" : `Discard changes to the listing for ${name}?`}
      leaveTitle={`Leave the ${name} listing?`}
      error={run.error && Object.keys(run.fieldErrors ?? {}).length === 0 ? run.error : undefined}
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

      <PhotoGallery
        propertyId={propertyId}
        name={name}
        photos={draft.photos}
        onAdd={(photo) => setDraft((d) => (d.photos.length >= MAX_PHOTOS ? d : { ...d, photos: [...d.photos, photo] }))}
        onRemove={(j) => setDraft((d) => ({ ...d, photos: d.photos.filter((_, k) => k !== j) }))}
        onMove={(j, dir) =>
          setDraft((d) => {
            const photos = [...d.photos];
            const target = j + dir;
            if (target < 0 || target >= photos.length) return d;
            [photos[j], photos[target]] = [photos[target], photos[j]];
            return { ...d, photos };
          })
        }
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

/** A round control on a photo, on the photo tokens: 24px, with a 44px hit area on touch. */
const onPhotoButton = cn(
  "relative flex h-6 w-6 items-center justify-center rounded-full bg-photo-scrim text-on-photo transition-opacity disabled:opacity-30",
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
);

/** Horizontal strip of photo thumbnails: add, remove, and left/right reorder. */
function PhotoGallery({
  propertyId,
  name,
  photos,
  onAdd,
  onRemove,
  onMove,
  onPendingChange,
}: {
  propertyId: string;
  /** The listing's unit, for the photos' alt text. */
  name: string;
  photos: EditablePhoto[];
  onAdd: (photo: EditablePhoto) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  /** How many uploads are still going, whenever it changes: the sheet's Save waits on it and says so. */
  onPendingChange: (pending: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Turn a raw @vercel/blob (or fetch) error into something an admin can act on. */
  function describeUploadError(e: unknown): string {
    const msg = e instanceof Error ? e.message : "";
    if (/not configured|Blob store/i.test(msg)) return "uploads aren't set up yet";
    if (/content type mismatch/i.test(msg)) {
      return (
        "HEIC photos aren't supported. Export as JPEG first, or on iPhone set " +
        'Settings → Camera → Formats to "Most Compatible"'
      );
    }
    if (/too large|exceeds the maximum/i.test(msg)) return "file is too large (25MB max)";
    // @vercel/blob's client always uses this exact generic wording when the request
    // for an upload token itself fails (auth, missing property, etc.): it discards
    // whatever specific reason the server actually sent back. A stale session is the
    // most common real cause, so that's the fix worth suggesting.
    if (/retrieve the client token/i.test(msg)) {
      return "couldn't start the upload. Reload the page, check you're still signed in, and try again";
    }
    return "upload failed";
  }

  async function pick(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setError(null);
    setBusy(true);
    let remaining = list.length;
    onPendingChange(remaining);
    const failures: string[] = [];
    try {
      // A few uploads at once instead of one at a time: each file was paying its own
      // full round-trip (mint a token, then the transfer) in strict sequence, so five
      // photos took ~5x one photo's time. Capped (not fully parallel) so a big batch
      // doesn't fire a burst of concurrent token requests at the DB all at once.
      const CONCURRENCY = 3;
      let next = 0;
      async function worker() {
        while (next < list.length) {
          const file = list[next++];
          try {
            const blob = await upload(file.name, file, {
              access: "public",
              handleUploadUrl: "/api/blob/listing-photo-upload",
              clientPayload: JSON.stringify({ propertyId }),
            });
            onAdd({ url: blob.url, pathname: blob.pathname });
          } catch (e) {
            // Keep going: one bad photo (wrong format, too large) shouldn't stop the rest of the batch.
            failures.push(`${file.name}: ${describeUploadError(e)}`);
          } finally {
            remaining -= 1;
            onPendingChange(remaining);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
      if (failures.length > 0) setError(failures.join("; "));
    } finally {
      setBusy(false);
      onPendingChange(0);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, j) => (
          // The controls show on hover or focus with a mouse; touch has no hover, so they stay.
          <div key={p.pathname} className="group/photo relative shrink-0">
            <PhotoThumb src={p.url} alt={`${name} photo ${j + 1}`} size={96} />
            <div className="absolute inset-0 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/photo:opacity-100 pointer-fine:group-hover/photo:opacity-100">
              <button
                type="button"
                onClick={() => onRemove(j)}
                aria-label={`Remove photo ${j + 1}`}
                className={cn(onPhotoButton, "absolute right-1 top-1")}
              >
                <X aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove(j, -1)}
                disabled={j === 0}
                aria-label={`Move photo ${j + 1} left`}
                className={cn(onPhotoButton, "absolute bottom-1 left-1")}
              >
                <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove(j, 1)}
                disabled={j === photos.length - 1}
                aria-label={`Move photo ${j + 1} right`}
                className={cn(onPhotoButton, "absolute bottom-1 right-1")}
              >
                <ChevronRight aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
            </div>
            {j === 0 && (
              <span className="pointer-events-none absolute left-1 top-1 inline-flex h-5 items-center rounded-full bg-photo-scrim px-1.5 text-micro text-on-photo">
                Cover
              </span>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS}
          className="flex h-18 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-fill-1 text-meta text-fg-2 transition-colors not-disabled:hover:text-fg-1 disabled:opacity-60"
        >
          <ImagePlus aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-fg-3" />
          {busy ? "Uploading…" : "Add photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <SaveError className="mt-1.5">{error}</SaveError>}
    </div>
  );
}
