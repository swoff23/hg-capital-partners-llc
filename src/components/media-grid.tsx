"use client";
import { useState } from "react";
import { ImageOff, Lock, Play } from "lucide-react";
import { Lightbox, taskMediaUrl, type MediaItem, type MediaUrlFor } from "@/components/lightbox";
import type { ActionResult } from "@/lib/action-result";
import { fmtDuration } from "@/lib/attachments/media";
import { cn } from "@/lib/utils";

export type { MediaItem, MediaUrlFor } from "@/components/lightbox";

/** A labeled run of the grid's items, in order: "At finish" (the latest Mark done's photos), then "Other photos". */
export type MediaGroup = { label: string; ids: readonly string[] };

/** Rows shown before "Show all": 2 rows is 6 tiles on a phone, 12 from sm up. */
const PHONE_COLS = 3;
const WIDE_COLS = 6;
const ROWS = 2;

/**
 * Square thumbnails of a task's photos and videos: 3 fluid columns on a
 * phone, 6 columns of 88px from sm up, two rows until "Show all". Photos load
 * ?v=thumb when the row has a thumbnail, otherwise the original. Videos show
 * their poster (or a dark tile), a play mark and the length. A tap opens the
 * Lightbox at that item; with `onDelete` (staff) it offers Delete there.
 * `urlFor` points tiles and the viewer at files outside the task route
 * (property files, public listing photos).
 *
 * The uploads spec's grid (2.5: newest first with the finish set leading,
 * the "+N" tile, the strip and one-row modes) is UP1's. `rows`, `variant`
 * and `groups` are part of the contract and not drawn yet: the grid shows
 * every item in the order given, two rows until "Show all".
 */
export function MediaGrid({
  items,
  className,
  onDelete,
  urlFor = taskMediaUrl,
  rows = 2,
  variant = "grid",
  groups,
}: {
  items: MediaItem[];
  className?: string;
  /** Removes an item for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
  /** Where each item's bytes are; task files by default. */
  urlFor?: MediaUrlFor;
  /** Rows before the overflow: 2, or 1 for the Review card's photo row. */
  rows?: 1 | 2;
  /** "strip": 48x36 thumbs in one line with a "+2" count, for Activity lines and the payoff (choice 3 A). */
  variant?: "grid" | "strip";
  /** Labeled runs ("At finish", "Other photos"); unlabeled when there's no Mark done set. */
  groups?: readonly MediaGroup[];
}) {
  void rows;
  void variant;
  void groups;
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  // Kept after closing, so the fade-out still shows the item that was open.
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;

  const phoneCap = PHONE_COLS * ROWS;
  const wideCap = WIDE_COLS * ROWS;
  const more = items.length > phoneCap && !expanded;

  return (
    <div className={className}>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-[repeat(6,88px)] sm:gap-2">
        {items.map((item, i) => (
          <li
            key={item.id}
            className={cn(!expanded && i >= wideCap && "hidden", !expanded && i >= phoneCap && "max-sm:hidden")}
          >
            <Tile
              item={item}
              urlFor={urlFor}
              onOpen={() => {
                setIndex(i);
                setOpen(true);
              }}
            />
          </li>
        ))}
      </ul>
      {more && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mt-2 rounded-md text-meta font-medium text-fg-1 hover:underline pointer-coarse:min-h-11",
            items.length <= wideCap && "sm:hidden",
          )}
        >
          Show all {items.length}
        </button>
      )}
      <Lightbox
        items={items}
        index={index}
        onIndexChange={setIndex}
        isOpen={open}
        onOpenChange={setOpen}
        onDelete={onDelete}
        urlFor={urlFor}
      />
    </div>
  );
}

function Tile({ item, urlFor, onOpen }: { item: MediaItem; urlFor: MediaUrlFor; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const video = item.kind === "VIDEO";
  const length = video ? fmtDuration(item.durationSec) : "";
  const src = video ? (item.hasPoster ? urlFor(item, "poster") : null) : urlFor(item, item.hasThumb ? "thumb" : undefined);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${video ? `Play video ${item.filename}${length ? `, ${length}` : ""}` : `Open photo ${item.filename}`}${item.internal ? ", internal" : ""}`}
      className={cn("relative block aspect-square w-full overflow-hidden rounded-lg", video ? "bg-photo-stage" : "bg-fill-1")}
    >
      {src && !broken ? (
        // Gated, session-checked route; next/image would cache it publicly.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        !video && (
          <span className="absolute inset-0 flex items-center justify-center text-fg-3">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
          </span>
        )
      )}
      {video && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-sm bg-photo-scrim px-1 py-0.5 text-micro tabular-nums text-on-photo">
          <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
          {length}
        </span>
      )}
      {item.internal && (
        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-sm bg-photo-scrim text-on-photo">
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      )}
      {/* The photo edge sits over the image, so a pale facade doesn't bleed into the page. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg inset-shadow-photo-edge" />
    </button>
  );
}
