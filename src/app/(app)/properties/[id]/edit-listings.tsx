"use client";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Badge, Button, EmptyState, Select } from "@/components/ui";
import { updatePropertyListings } from "../actions";

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

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

const STATUS_TONE: Record<EditableListing["status"], "green" | "gray" | "amber"> = {
  AVAILABLE: "green",
  LEASED: "gray",
  HIDDEN: "amber",
};
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

export function ListingsSection({
  propertyId,
  initial,
  unitLabels,
}: {
  propertyId: string;
  initial: EditableListing[];
  /** Unit labels from the Units & access section above — the only valid choices, so the two stay consistent. */
  unitLabels: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [listings, setListings] = useState<EditableListing[]>(structuredClone(initial));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(listings) !== JSON.stringify(initial);

  function mutate(fn: (l: EditableListing[]) => void) {
    setListings((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function save() {
    start(async () => {
      await updatePropertyListings(propertyId, listings);
      setConfirmOpen(false);
      setEditing(false);
    });
  }

  function discard() {
    setListings(structuredClone(initial));
    setConfirmOpen(false);
    setEditing(false);
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else discard();
  }

  return (
    <div className="group rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Rentals</h3>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={unitLabels.length === 0}
              title={unitLabels.length === 0 ? "Add a unit in Units & access above first" : undefined}
              onClick={() => mutate((x) => x.push(blankListing()))}
            >
              + Add listing
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        {!editing ? (
          <ReadListings listings={initial} />
        ) : listings.length === 0 ? (
          unitLabels.length === 0 ? (
            <EmptyState>Add at least one unit in Units &amp; access above before creating a listing.</EmptyState>
          ) : (
            <EmptyState>No listings yet.</EmptyState>
          )
        ) : (
          listings.map((l, i) => (
            <EditListingCard
              key={l.id ?? `new-${i}`}
              listing={l}
              index={i}
              propertyId={propertyId}
              unitLabels={unitLabels}
              mutate={mutate}
            />
          ))
        )}
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold">Discard unsaved changes?</h4>
            <p className="mt-1 text-xs text-muted">
              You have unsaved changes to Rentals. Save them, or discard and exit.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button size="sm" variant="secondary" onClick={discard}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadListings({ listings }: { listings: EditableListing[] }) {
  if (listings.length === 0) return <EmptyState>No listings yet.</EmptyState>;
  return (
    <div className="space-y-2">
      {listings.map((l, i) => (
        <div key={l.id ?? i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          {l.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail, not the public page
            <img src={l.photos[0].url} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-10 w-14 shrink-0 rounded bg-background" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{l.unitLabel || "Unlabeled unit"}</span>
              <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
              {l.photos.length > 1 && (
                <span className="text-xs text-muted">{l.photos.length} photos</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {[
                l.rent && `$${l.rent}/mo`,
                l.beds && `${l.beds} bd`,
                l.baths && `${l.baths} ba`,
                l.sqft && `${l.sqft} sqft`,
              ]
                .filter(Boolean)
                .join(" · ") || "No details yet"}
            </div>
          </div>
          {l.zillowUrl && (
            <a
              href={l.zillowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Zillow ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function EditListingCard({
  listing: l,
  index: i,
  propertyId,
  unitLabels,
  mutate,
}: {
  listing: EditableListing;
  index: number;
  propertyId: string;
  unitLabels: string[];
  mutate: (fn: (l: EditableListing[]) => void) => void;
}) {
  // Include the listing's current label even if it's since been renamed/removed
  // from Units & access, so an existing pick never silently disappears.
  const options = l.unitLabel && !unitLabels.includes(l.unitLabel) ? [l.unitLabel, ...unitLabels] : unitLabels;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Select
          className="h-7 w-auto max-w-[180px] py-0 text-xs"
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
        </Select>
        <Select
          className="h-7 w-auto py-0 text-xs"
          value={l.status}
          onChange={(e) => mutate((x) => (x[i].status = e.target.value as EditableListing["status"]))}
        >
          <option value="HIDDEN">Hidden</option>
          <option value="AVAILABLE">Available</option>
          <option value="LEASED">Leased</option>
        </Select>
        <button
          onClick={() => mutate((x) => x.splice(i, 1))}
          className="ml-auto text-xs text-red-500 hover:underline"
        >
          Remove listing
        </button>
      </div>

      <div className="space-y-3 p-3">
        <PhotoGallery
          propertyId={propertyId}
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
        />

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted">Zillow link</span>
            <input
              className={inp}
              placeholder="https://www.zillow.com/…"
              value={l.zillowUrl}
              onChange={(e) => mutate((x) => (x[i].zillowUrl = e.target.value))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Available</span>
            <input
              type="date"
              className={inp}
              value={l.availableDate}
              onChange={(e) => mutate((x) => (x[i].availableDate = e.target.value))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Rent / month</span>
            <input
              type="number"
              min="0"
              className={inp}
              value={l.rent}
              onChange={(e) => mutate((x) => (x[i].rent = e.target.value))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Sqft</span>
            <input
              type="number"
              min="0"
              className={inp}
              value={l.sqft}
              onChange={(e) => mutate((x) => (x[i].sqft = e.target.value))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Beds</span>
            <input
              className={inp}
              placeholder="2"
              value={l.beds}
              onChange={(e) => mutate((x) => (x[i].beds = e.target.value))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Baths</span>
            <input
              className={inp}
              placeholder="1"
              value={l.baths}
              onChange={(e) => mutate((x) => (x[i].baths = e.target.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/** Horizontal strip of photo thumbnails — add, remove, and left/right reorder. */
function PhotoGallery({
  propertyId,
  photos,
  onAdd,
  onRemove,
  onMove,
}: {
  propertyId: string;
  photos: EditablePhoto[];
  onAdd: (photo: EditablePhoto) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setError(null);
    setBusy(true);
    for (const file of list) {
      try {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/blob/listing-photo-upload",
          clientPayload: JSON.stringify({ propertyId }),
        });
        onAdd({ url: blob.url, pathname: blob.pathname });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(/not configured|Blob store/i.test(msg) ? "Uploads aren't set up yet." : "Upload failed.");
        break;
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, j) => (
          <div key={p.pathname} className="group/photo relative h-20 w-28 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin preview, not the public page */}
            <img src={p.url} alt="" className="h-full w-full rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={() => onRemove(j)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover/photo:opacity-100"
            >
              ✕
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover/photo:opacity-100">
              <button
                type="button"
                onClick={() => onMove(j, -1)}
                disabled={j === 0}
                aria-label="Move left"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => onMove(j, 1)}
                disabled={j === photos.length - 1}
                aria-label="Move right"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:opacity-30"
              >
                ›
              </button>
            </div>
            {j === 0 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">Cover</span>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-background text-center text-[10px] text-muted hover:border-primary disabled:opacity-60"
        >
          {busy ? "Uploading…" : "+ Add photo"}
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
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
