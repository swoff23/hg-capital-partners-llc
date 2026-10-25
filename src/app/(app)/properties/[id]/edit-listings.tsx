"use client";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Button as AriaButton } from "react-aria-components";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, MoreHorizontal, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { Button, SectionCard, buttonClass, fieldClass, textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { updatePropertyListings } from "../actions";
import { callAction } from "@/lib/action-result";
import { LabeledField } from "../labeled-field";
import { AddRow, SaveError } from "./record-ui";

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

/** A field in a dense editor row: 32px with a mouse, 44 on touch. */
const inp = cn(fieldClass, "h-8");

// A listing's status is a label, not a state, so its word stays neutral (fg-2, as on Portfolio).
const STATUS_LABEL: Record<EditableListing["status"], string> = {
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

/** A listing added in this draft (no id yet) that's still exactly blank. */
function isUntouchedNew(l: EditableListing): boolean {
  return l.id === null && JSON.stringify(l) === JSON.stringify(blankListing());
}

export function ListingsSection({
  propertyId,
  version,
  initial,
  unitLabels,
}: {
  propertyId: string;
  /** Property.updatedAt the page rendered with; Edit pins it, and the save refuses a newer row. */
  version: string;
  initial: EditableListing[];
  /** Unit labels from the Units & access section above: the only valid choices, so the two stay consistent. */
  unitLabels: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [listings, setListings] = useState<EditableListing[]>(structuredClone(initial));
  // The version Edit opened at. A save in another card refreshes the page with a
  // newer one, and sending that would let this draft overwrite a partner's change.
  const [editVersion, setEditVersion] = useState(version);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // How many photo uploads are currently in flight, across every listing card. A photo
  // isn't in `listings` state until its upload resolves and calls onAdd: saving while
  // this is > 0 would silently persist the listings *without* the photo still uploading,
  // with no error to show for it. Save stays disabled until every upload settles.
  const [uploadingCount, setUploadingCount] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // A listing Add listing opened and nobody touched isn't a change, so Cancel doesn't ask about it.
  const dirty = JSON.stringify(listings.filter((l) => !isUntouchedNew(l))) !== JSON.stringify(initial);
  const noUnits = unitLabels.length === 0;

  function mutate(fn: (l: EditableListing[]) => void) {
    setListings((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  /**
   * Start from what's saved now: after a save the page brings each new
   * listing's id, and a draft still holding a null id would delete that
   * listing with its photo files and add it back as a new one.
   */
  function edit(withNew = false) {
    setError(null);
    setListings(withNew ? [...structuredClone(initial), blankListing()] : structuredClone(initial));
    setEditVersion(version);
    setEditing(true);
  }

  function save() {
    setError(null);
    // A number input hands React "" for text it can't read ("1,500", "15oo"), and
    // the server would store that blank over the rent. Catch it while the typed
    // text is still in the field.
    const unreadable = [...(root.current?.querySelectorAll<HTMLInputElement>("input[data-check]") ?? [])].find(
      (el) => el.validity.badInput,
    );
    if (unreadable) {
      setError(unreadable.dataset.check ?? "Check the numbers.");
      unreadable.focus();
      return;
    }
    start(async () => {
      const r = await callAction(() => updatePropertyListings(propertyId, listings, editVersion));
      if (!r.ok) {
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setEditing(false);
    });
  }

  function discard() {
    setError(null);
    setListings(structuredClone(initial));
    setConfirmOpen(false);
    setEditing(false);
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else discard();
  }

  const saveLabel = pending ? "Saving…" : uploadingCount > 0 ? "Uploading…" : null;

  return (
    <div ref={root}>
      <SectionCard
        title="Rentals"
        onEdit={() => edit()}
        editing={editing}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            {/* Waits for every photo upload: the label says so while one is going up. */}
            <Button size="sm" onClick={save} disabled={pending || uploadingCount > 0}>
              {saveLabel ?? "Save"}
            </Button>
          </>
        }
      >
        {!editing ? (
          <>
            {initial.length === 0 ? (
              <p className="pb-2 text-body text-fg-3">No listings yet.</p>
            ) : (
              <ReadListings listings={initial} />
            )}
            <AddRow onClick={() => edit(true)} disabled={noUnits}>
              Add listing
            </AddRow>
            {noUnits && <p className="text-meta text-fg-3">Add a unit in Units &amp; access first.</p>}
          </>
        ) : (
          <>
            {listings.length > 0 && (
              <ul className="divide-y divide-line">
                {listings.map((l, i) => (
                  <EditListing
                    key={l.id ?? `new-${i}`}
                    listing={l}
                    index={i}
                    propertyId={propertyId}
                    unitLabels={unitLabels}
                    mutate={mutate}
                    onUploadBusyChange={(busy) => setUploadingCount((c) => c + (busy ? 1 : -1))}
                  />
                ))}
              </ul>
            )}
            <AddRow onClick={() => mutate((x) => x.push(blankListing()))} disabled={noUnits}>
              Add listing
            </AddRow>
            {noUnits && <p className="text-meta text-fg-3">Add a unit in Units &amp; access first.</p>}
          </>
        )}

        {error && <SaveError className="mt-2">{error}</SaveError>}
      </SectionCard>

      {confirmOpen && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have unsaved changes to Rentals. Save them, or discard and exit."
          onClose={() => setConfirmOpen(false)}
          cancelLabel="Keep editing"
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={discard}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={pending || uploadingCount > 0}>
                {saveLabel ?? "Save changes"}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

function ReadListings({ listings }: { listings: EditableListing[] }) {
  return (
    <ul className="divide-y divide-line">
      {listings.map((l, i) => {
        const facts = [l.beds && `${l.beds} bd`, l.baths && `${l.baths} ba`, l.sqft && `${l.sqft} sq ft`].filter(Boolean);
        const name = l.unitLabel || "Unlabeled unit";
        return (
          <li key={l.id ?? i} className="flex min-h-14 items-center gap-3 py-2">
            <PhotoThumb src={l.photos[0]?.url} alt={`${name} listing photo`} size={48} />
            <div className="min-w-0 flex-1">
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
            </div>
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
            {/* The status in one fixed column at the row's end, whether or not a Zillow link sits before it. */}
            <span className="w-20 shrink-0 whitespace-nowrap text-meta font-medium text-fg-2 max-[480px]:hidden">
              {STATUS_LABEL[l.status]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EditListing({
  listing: l,
  index: i,
  propertyId,
  unitLabels,
  mutate,
  onUploadBusyChange,
}: {
  listing: EditableListing;
  index: number;
  propertyId: string;
  unitLabels: string[];
  mutate: (fn: (l: EditableListing[]) => void) => void;
  onUploadBusyChange: (busy: boolean) => void;
}) {
  // Include the listing's current label even if it's since been renamed/removed
  // from Units & access, so an existing pick never silently disappears.
  const options = l.unitLabel && !unitLabels.includes(l.unitLabel) ? [l.unitLabel, ...unitLabels] : unitLabels;
  const name = l.unitLabel || "New listing";

  return (
    <li className="space-y-3 py-4 first:pt-1">
      {/* One row at every width: the unit takes what the status and the menu leave. */}
      <div className="flex items-center gap-2">
        <select
          className={cn(inp, "min-w-0 flex-1 sm:max-w-48")}
          aria-label="Unit"
          value={l.unitLabel}
          onChange={(e) => mutate((x) => (x[i].unitLabel = e.target.value))}
        >
          <option value="" disabled>
            Select unit…
          </option>
          {options.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={cn(inp, "w-32 shrink-0")}
          aria-label="Status"
          value={l.status}
          onChange={(e) => mutate((x) => (x[i].status = e.target.value as EditableListing["status"]))}
        >
          <option value="HIDDEN">Hidden</option>
          <option value="AVAILABLE">Available</option>
          <option value="LEASED">Leased</option>
        </select>
        <span className="ml-auto shrink-0">
          <MenuTrigger>
            <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
              <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            </AriaButton>
            <Menu>
              <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => mutate((x) => void x.splice(i, 1))}>
                Delete listing
              </MenuItem>
            </Menu>
          </MenuTrigger>
        </span>
      </div>

      <PhotoGallery
        propertyId={propertyId}
        name={name}
        photos={l.photos}
        onAdd={(photo) => mutate((x) => void x[i].photos.push(photo))}
        onRemove={(j) => mutate((x) => void x[i].photos.splice(j, 1))}
        onMove={(j, dir) =>
          mutate((x) => {
            const arr = x[i].photos;
            const target = j + dir;
            if (target < 0 || target >= arr.length) return;
            [arr[j], arr[target]] = [arr[target], arr[j]];
          })
        }
        onBusyChange={onUploadBusyChange}
      />

      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @min-[30rem]:grid-cols-3">
          <LabeledField label="Zillow link" className="col-span-2 @min-[30rem]:col-span-1">
            <input
              className={inp}
              placeholder="https://www.zillow.com/…"
              value={l.zillowUrl}
              onChange={(e) => mutate((x) => (x[i].zillowUrl = e.target.value))}
            />
          </LabeledField>
          <LabeledField label="Available">
            <input
              type="date"
              className={inp}
              value={l.availableDate}
              onChange={(e) => mutate((x) => (x[i].availableDate = e.target.value))}
            />
          </LabeledField>
          <LabeledField label="Rent / month">
            <input
              type="number"
              min="0"
              className={cn(inp, "num")}
              value={l.rent}
              data-check={`Rent for ${l.unitLabel || "Unit"} isn't a number.`}
              onChange={(e) => mutate((x) => (x[i].rent = e.target.value))}
            />
          </LabeledField>
          <LabeledField label="Sq ft">
            <input
              type="number"
              min="0"
              className={cn(inp, "num")}
              value={l.sqft}
              data-check={`Sq ft for ${l.unitLabel || "Unit"} isn't a whole number.`}
              onChange={(e) => mutate((x) => (x[i].sqft = e.target.value))}
            />
          </LabeledField>
          <LabeledField label="Beds">
            <input
              className={inp}
              placeholder="2"
              value={l.beds}
              onChange={(e) => mutate((x) => (x[i].beds = e.target.value))}
            />
          </LabeledField>
          <LabeledField label="Baths">
            <input
              className={inp}
              placeholder="1"
              value={l.baths}
              onChange={(e) => mutate((x) => (x[i].baths = e.target.value))}
            />
          </LabeledField>
        </div>
      </div>
    </li>
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
  onBusyChange,
}: {
  propertyId: string;
  /** The listing's unit, for the photos' alt text. */
  name: string;
  photos: EditablePhoto[];
  onAdd: (photo: EditablePhoto) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  /** Tells the parent (which gates Save on it) whenever an upload starts/finishes here. */
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Turn a raw @vercel/blob (or fetch) error into something an admin can act on. */
  function describeUploadError(e: unknown): string {
    const msg = e instanceof Error ? e.message : "";
    if (/not configured|Blob store/i.test(msg)) return "uploads aren't set up yet";
    if (/content type mismatch/i.test(msg)) {
      return "HEIC photos aren't supported. Export as JPEG first, or on iPhone set " +
        "Settings → Camera → Formats to \"Most Compatible\"";
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
    onBusyChange(true);
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
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
      if (failures.length > 0) setError(failures.join("; "));
    } finally {
      setBusy(false);
      onBusyChange(false);
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
          disabled={busy}
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
