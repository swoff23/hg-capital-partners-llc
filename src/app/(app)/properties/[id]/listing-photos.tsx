"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { PhotoThumb } from "@/components/photo-thumb";
import { SaveError } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LISTING_PHOTO_MAX, movedPhoto, withPhoto, withoutPhoto, type ListingPhotoDraft } from "./listing-photo-set";

export { LISTING_PHOTO_MAX, type ListingPhotoDraft } from "./listing-photo-set";

/**
 * Deletes the blobs ListingPhotos uploaded for this property since its sheet
 * opened, except those in `keep` (G1D-026). Discard, Cancel, X and Esc call
 * it with nothing kept; a Save that landed calls it with the photos it
 * stored, so a photo uploaded and then removed before Save goes too.
 *
 * Contract (build plan 1.5, UP2 finishes it): until then the gallery keeps
 * no record of what it uploaded, so there's nothing to delete and
 * discarded uploads stay in Blob, as before.
 */
export async function discardSessionUploads(propertyId: string, keep: readonly ListingPhotoDraft[] = []): Promise<void> {
  void propertyId;
  void keep;
}

/** A round control on a photo, on the photo tokens: 24px, with a 44px hit area on touch. */
const onPhotoButton = cn(
  "relative flex h-6 w-6 items-center justify-center rounded-full bg-photo-scrim text-on-photo transition-opacity disabled:opacity-30",
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
);

/**
 * A rental listing's public photos inside its sheet (docs/specs/
 * uploads-photos.md 2.9): add, remove, reorder, and the first is the cover.
 * Controlled: `value` is the set, in carousel order, and every change comes
 * back through `onChange`; nothing is saved until the sheet's Save.
 * `onPendingChange` reports how many uploads are still going, so Save can
 * wait and say so ("2 photos uploading").
 *
 * Contract (build plan 1.5, UP2 finishes it): the photo manager on the
 * upload queue as a `display` target, with a big cover, drag to reorder, one
 * ⋯ per photo and drops. Until then it is the gallery the sheet had: a strip
 * of 96px photos with Remove and left and right on each, a "Cover" pill on
 * the first, and "Add photo", uploading straight to public Blob three at a
 * time.
 */
export function ListingPhotos({
  propertyId,
  name,
  value,
  onChange,
  max = LISTING_PHOTO_MAX,
  onPendingChange,
}: {
  propertyId: string;
  /** The listing's unit, for the photos' alt text. */
  name: string;
  value: readonly ListingPhotoDraft[];
  onChange: (photos: ListingPhotoDraft[]) => void;
  /** The most photos the listing holds. */
  max?: number;
  /** How many uploads are still going, whenever it changes: the sheet's Save waits on it and says so. */
  onPendingChange?: (pending: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uploads land one by one, before the sheet re-renders: each change starts from the latest set, not the one
  // this render saw, so two photos finishing together both stay.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const commit = (next: ListingPhotoDraft[]) => {
    latest.current = next;
    onChange(next);
  };

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
    onPendingChange?.(remaining);
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
            commit(withPhoto(latest.current, { url: blob.url, pathname: blob.pathname }, max));
          } catch (e) {
            // Keep going: one bad photo (wrong format, too large) shouldn't stop the rest of the batch.
            failures.push(`${file.name}: ${describeUploadError(e)}`);
          } finally {
            remaining -= 1;
            onPendingChange?.(remaining);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
      if (failures.length > 0) setError(failures.join("; "));
    } finally {
      setBusy(false);
      onPendingChange?.(0);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((p, j) => (
          // The controls show on hover or focus with a mouse; touch has no hover, so they stay.
          <div key={p.pathname} className="group/photo relative shrink-0">
            <PhotoThumb src={p.url} alt={`${name} photo ${j + 1}`} size={96} />
            <div className="absolute inset-0 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/photo:opacity-100 pointer-fine:group-hover/photo:opacity-100">
              <button
                type="button"
                onClick={() => commit(withoutPhoto(latest.current, j))}
                aria-label={`Remove photo ${j + 1}`}
                className={cn(onPhotoButton, "absolute right-1 top-1")}
              >
                <X aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => commit(movedPhoto(latest.current, j, -1))}
                disabled={j === 0}
                aria-label={`Move photo ${j + 1} left`}
                className={cn(onPhotoButton, "absolute bottom-1 left-1")}
              >
                <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => commit(movedPhoto(latest.current, j, 1))}
                disabled={j === value.length - 1}
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
          disabled={busy || value.length >= max}
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
