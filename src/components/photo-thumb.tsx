"use client";
import { useState } from "react";
import Image from "next/image";
import { House, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The sizes a building's photo appears at (docs/brand-guidelines.md, section
 * 6). 32 is a square in search and Home rows; 48 and 96 are 4:3 (48x36 in
 * Portfolio rows, 96x72 in the record header); "full" is full width at 16:9
 * (the phone property page and the job page); "tile" fills its column at 4:3
 * (the listing photo manager's grid, uploads 2.9). Photos 32px and under take
 * rounded-sm, bigger ones rounded-lg.
 */
const SIZES = {
  32: { box: "h-8 w-8 rounded-sm", sizes: "32px" },
  48: { box: "h-9 w-12 rounded-lg", sizes: "48px" },
  96: { box: "h-18 w-24 rounded-lg", sizes: "96px" },
  full: { box: "aspect-video w-full rounded-lg", sizes: "100vw" },
  tile: { box: "aspect-4/3 w-full rounded-lg", sizes: "(min-width: 768px) 25vw, 50vw" },
} as const;

export type PhotoThumbSize = keyof typeof SIZES;

/**
 * A property photo over a --fill-1 placeholder, fading in over 200ms, with
 * the photo edge on top so a pale facade doesn't bleed into the page. With
 * no photo (or one that fails to load) it's the finished fallback tile: the
 * same size and radius with lucide's House at 40% of the height in --fg-3.
 *
 * `status` puts a pill in the top-left ("Vacant Nov 1"), only when the state
 * needs attention, and only on the 96 and full sizes, where it fits.
 * `failed` marks an upload that didn't go up: a 2px --danger ring in place
 * of the edge, and with `onRetry` a Retry pill near the bottom.
 *
 * `addLabel` is for the staff header of a building with no photo yet
 * (uploads 2.10): "Add photo" in text-label --fg-2 under the House, at the 96
 * and full sizes where it fits. The caller makes the tile a button.
 *
 * `alt` names the place: "Front of 767 Prospect Ave". A photo behind a
 * session-checked route (/api/files/...) is always served unoptimized, since
 * the image optimizer forwards no cookies and would cache it publicly; pass
 * `unoptimized` for any other such route (an upload's preview is a blob: URL).
 * Public Vercel Blob photos from our store are allowed in next.config.ts.
 * `sizes` tells the optimizer how wide the photo draws when it isn't the
 * size's own (a cover that spans two columns).
 */
export function PhotoThumb({
  src,
  alt,
  size = 48,
  status,
  failed = false,
  onRetry,
  addLabel,
  unoptimized = false,
  preload = false,
  sizes: sizesHint,
  className,
}: {
  src?: string | null;
  alt: string;
  size?: PhotoThumbSize;
  status?: string;
  failed?: boolean;
  onRetry?: () => void;
  /** The empty tile's invitation, "Add photo". Drawn at the 96 and full sizes only. */
  addLabel?: string;
  unoptimized?: boolean;
  /** Starts loading in the <head>, for the one photo above the fold (next/image `preload`). */
  preload?: boolean;
  /** next/image `sizes`, when the photo draws at a width other than the size's own. */
  sizes?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  // A new photo in the same tile (the front photo replaced) starts over: it fades in, and an old failure doesn't carry.
  const [shown, setShown] = useState(src);
  if (src !== shown) {
    setShown(src);
    setLoaded(false);
    setBroken(false);
  }
  const { box, sizes } = SIZES[size];
  const photo = src && !broken;
  const labelled = !!addLabel && (size === 96 || size === "full");

  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-fill-1", box, className)}>
      {photo ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizesHint ?? sizes}
          unoptimized={unoptimized || src.startsWith("/api/files/")}
          preload={preload}
          // Not a drag source of its own: a tile that reorders (the listing manager) drags as a whole.
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cn(
            "object-cover opacity-0 transition-opacity duration-photo motion-reduce:transition-none",
            loaded && "opacity-100",
          )}
        />
      ) : (
        <span role="img" aria-label={alt} className={cn("absolute inset-0 flex items-center justify-center text-fg-3", labelled && "flex-col gap-1")}>
          {/* absoluteStrokeWidth: a 1.5px line at any tile size, like the rest of the drawn set (a scaled
              stroke would be 5px on the phone's full-width header). */}
          <House aria-hidden="true" strokeWidth={1.5} absoluteStrokeWidth className="aspect-square h-2/5 w-auto" />
          {labelled && (
            <span aria-hidden="true" className="text-label text-fg-2">
              {addLabel}
            </span>
          )}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit]",
          failed ? "ring-2 ring-inset ring-danger" : "inset-shadow-photo-edge",
        )}
      />
      {status && (
        <span className="absolute left-3 top-3 inline-flex h-6 items-center rounded-full bg-pill-bg px-2 text-micro text-pill-fg">
          {status}
        </span>
      )}
      {failed && onRetry && <RetryPill onClick={onRetry} />}
    </span>
  );
}

/**
 * The Retry pill on a failed photo (docs/brand-guidelines.md, section 9
 * Photos): 32px, 8px above the bottom center of the nearest positioned box,
 * with a 44px hit area. PhotoThumb's `onRetry` shows it; the upload grid uses
 * it on its own tiles. `label` names the file when several can fail.
 */
export function RetryPill({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute bottom-2 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-pill-bg px-3 text-meta font-medium text-pill-fg",
        // A 44px hit area around the 32px pill.
        "after:absolute after:-inset-1.5",
      )}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      Retry
    </button>
  );
}
