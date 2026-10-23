"use client";
import { useState } from "react";
import { ImageOff, Lock, Play } from "lucide-react";
import { Lightbox, type MediaItem } from "@/components/lightbox";
import type { ActionResult } from "@/lib/action-result";
import { fmtDuration, taskFileUrl } from "@/lib/attachments/media";
import { cn } from "@/lib/utils";

export type { MediaItem } from "@/components/lightbox";

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
 */
export function MediaGrid({
  items,
  className,
  onDelete,
}: {
  items: MediaItem[];
  className?: string;
  /** Removes an item for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
}) {
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
            "mt-2 rounded-md text-xs font-medium text-fg-1 hover:underline pointer-coarse:min-h-11",
            items.length <= wideCap && "sm:hidden",
          )}
        >
          Show all {items.length}
        </button>
      )}
      <Lightbox items={items} index={index} onIndexChange={setIndex} isOpen={open} onOpenChange={setOpen} onDelete={onDelete} />
    </div>
  );
}

function Tile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const video = item.kind === "VIDEO";
  const length = video ? fmtDuration(item.durationSec) : "";
  const src = video ? (item.hasPoster ? taskFileUrl(item.id, "poster") : null) : taskFileUrl(item.id, item.hasThumb ? "thumb" : undefined);

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
