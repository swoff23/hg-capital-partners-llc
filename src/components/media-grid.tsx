"use client";
import { Fragment, useCallback, useState, type ReactNode } from "react";
import { FileImage, ImageOff, Lock, Play } from "lucide-react";
import { Lightbox, taskMediaUrl, useViewerLink, type LightboxMenuItem, type LightboxSurface, type MediaItem, type MediaUrlFor } from "@/components/lightbox";
import { PhotoThumb } from "@/components/photo-thumb";
import type { ActionResult } from "@/lib/action-result";
import { fmtDuration, bylineName, bylineStamp, documentLook, uploadCountPhrase, visibleTiles } from "@/lib/attachments/media";
import { cn } from "@/lib/utils";

export type { MediaItem, MediaUrlFor } from "@/components/lightbox";

/** A labeled run of the grid's items, in order: "At finish" (the latest Mark done's photos), then "Other photos". */
export type MediaGroup = { label: string; ids: readonly string[] };

/** Tiles in a row: 3 fluid columns on a phone, 6 of 88px from sm. */
const PHONE_COLS = 3;
const WIDE_COLS = 6;

/** The strip shows this many thumbs, one fewer inside a comment card at 320. */
const STRIP_MAX = 4;

/**
 * Square thumbnails of a record's photos and videos (docs/specs/uploads-
 * photos.md 2.5): 3 fluid columns on a phone, 6 of 88px from sm, two rows
 * (a labeled run starts a new row, so rows are counted as they fall), the
 * last tile carrying "+N" when there are more, which opens the viewer at that
 * photo with the whole set. Photos load ?v=thumb when the row has a
 * thumbnail, otherwise the original. Videos show their poster (or a dark
 * tile), a play mark and the length. A tap opens the Lightbox at that item.
 * With `link` (the record's own grid, once per page: the task page's Photos
 * section, the job page's) it also pushes `?file=<id>`, so Back closes the
 * viewer and the link can be shared; every other grid keeps the viewer in
 * local state, so a photo that shows twice on a page (the section and its
 * Activity comment) never opens two viewers. With `onDelete` (staff) the
 * viewer offers Delete. `urlFor` points tiles and the viewer at files outside
 * the task route (property files, public listing photos).
 *
 * The caller orders the items (newest first, the finish set leading:
 * lib/tasks/media.ts orderMedia); `groups` puts a label above each run,
 * "At finish" and "Other photos", and is left off when the job has no Mark
 * done set. `rows={1}` is the Review card's single row (6 from sm, 3 on a
 * phone, no labels); `variant="strip"` is Activity's and the payoff's: 48x36
 * thumbs in one line, as many as fit, then "+2" in `--fg-3`, opening the
 * viewer at that set.
 *
 * A photo the browser can't draw shows its type (a HEIC tile outside Safari),
 * not a broken glyph. A tile's edge steps up to `--line-control` under a
 * mouse. `surface`, `menuItems`, `canEdit`, `header` and `onRename` go to the
 * viewer as they are.
 */
export function MediaGrid({
  items,
  className,
  onDelete,
  onRename,
  urlFor = taskMediaUrl,
  rows = 2,
  variant = "grid",
  groups,
  inCard = false,
  link = false,
  surface,
  header,
  menuItems,
  canEdit,
}: {
  items: readonly MediaItem[];
  className?: string;
  /** Removes an item for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
  /** Renames an item from the viewer (staff). */
  onRename?: (id: string, name: string) => Promise<ActionResult<{ filename: string }>>;
  /** Where each item's bytes are; task files by default. */
  urlFor?: MediaUrlFor;
  /** Rows before the overflow: 2, or 1 for the Review card's photo row. */
  rows?: 1 | 2;
  /** "strip": 48x36 thumbs in one line with a "+2" count, for Activity lines and the payoff (choice 3 A). */
  variant?: "grid" | "strip";
  /** Labeled runs ("At finish", "Other photos"); unlabeled when there's no Mark done set. */
  groups?: readonly MediaGroup[];
  /** A strip inside a comment card shows one thumb fewer at 320. */
  inCard?: boolean;
  /** Push `?file=<id>` when the viewer opens. Off unless asked: only the record's own grid, once per page, turns it on. */
  link?: boolean;
  surface?: LightboxSurface;
  header?: { title: ReactNode; byline?: ReactNode };
  menuItems?: (item: MediaItem) => readonly LightboxMenuItem[];
  canEdit?: boolean;
}) {
  const viewer = useViewerLink(items, link && variant === "grid" && rows === 2);
  if (items.length === 0) return null;

  const total = items.length;
  const noun = uploadCountPhrase(items.map((it) => (it.kind === "VIDEO" ? "video" : "image")));
  const lightbox = (
    <Lightbox
      items={items}
      index={viewer.index}
      onIndexChange={viewer.setIndex}
      isOpen={viewer.isOpen}
      onOpenChange={viewer.onOpenChange}
      onDelete={onDelete}
      onRename={onRename}
      urlFor={urlFor}
      surface={surface}
      header={header}
      menuItems={menuItems}
      canEdit={canEdit}
    />
  );

  if (variant === "strip") {
    const shown = items.slice(0, STRIP_MAX);
    const more = total - STRIP_MAX;
    // Inside a comment card at 320 the 4th photo drops, so exactly four still end with a "+1".
    const narrowMore = inCard ? Math.max(0, total - (STRIP_MAX - 1)) : 0;
    return (
      <div className={className}>
        <ul className="flex items-center gap-2">
          {shown.map((item, i) => (
            <li key={item.id} className={cn(inCard && i === STRIP_MAX - 1 && "max-[359px]:hidden")}>
              <StripThumb item={item} urlFor={urlFor} onOpen={() => viewer.openAt(i)} />
            </li>
          ))}
          {(more > 0 || narrowMore > 0) && (
            <li className="text-meta tabular-nums text-fg-3">
              {more > 0 && <span className={cn(inCard && "max-[359px]:hidden")}>+{more}</span>}
              {narrowMore > 0 && <span className="min-[360px]:hidden">+{narrowMore}</span>}
            </li>
          )}
        </ul>
        {lightbox}
      </div>
    );
  }

  const labelAt = new Map<number, string>();
  if (groups && rows === 2) {
    for (const g of groups) {
      const first = items.findIndex((it) => g.ids.includes(it.id));
      if (first >= 0) labelAt.set(first, g.label);
    }
  }
  // Rows are counted as they fall: a label starts a new row, so "At finish" with 2 photos doesn't leave "+9" alone on a third.
  const starts = [...labelAt.keys()];
  const phoneCap = visibleTiles(total, PHONE_COLS, rows, starts);
  const wideCap = visibleTiles(total, WIDE_COLS, rows, starts);

  return (
    <div className={className}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(6,88px)]">
        {items.map((item, i) => {
          const hidden = cn(i >= wideCap && "hidden", i >= phoneCap && i < wideCap && "max-sm:hidden");
          // The last visible tile carries what's left: one count for a phone, one from sm.
          const phoneMore = total > phoneCap && i === phoneCap - 1 ? total - phoneCap + 1 : 0;
          const wideMore = total > wideCap && i === wideCap - 1 ? total - wideCap + 1 : 0;
          const label = labelAt.get(i);
          return (
            <Fragment key={item.id}>
              {label && (
                <li className={cn("col-span-full text-meta font-medium text-fg-2", i > 0 && "mt-2", hidden)}>{label}</li>
              )}
              <li className={hidden}>
                <Tile
                  item={item}
                  urlFor={urlFor}
                  more={{ phone: phoneMore, wide: wideMore, noun }}
                  onOpen={() => viewer.openAt(i)}
                />
              </li>
            </Fragment>
          );
        })}
      </ul>
      {lightbox}
    </div>
  );
}

/** "Open photo by Zack, Oct 25, 2:14 PM" and its video and Internal forms. */
function tileName(item: MediaItem): string {
  const video = item.kind === "VIDEO";
  const length = video ? fmtDuration(item.durationSec) : "";
  const by = bylineName(item.uploadedBy);
  const when = bylineStamp(item.createdAt, { time: true });
  const who = [by && `by ${by}`, when].filter(Boolean).join(", ");
  return `${video ? "Play video" : "Open photo"}${who ? ` ${who}` : ` ${item.filename}`}${video && length ? `, ${length}` : ""}${item.internal ? ", internal" : ""}`;
}

function Tile({
  item,
  urlFor,
  more,
  onOpen,
}: {
  item: MediaItem;
  urlFor: MediaUrlFor;
  more: { phone: number; wide: number; noun: string };
  onOpen: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const video = item.kind === "VIDEO";
  const length = video ? fmtDuration(item.durationSec) : "";
  const src = video ? (item.hasPoster ? urlFor(item, "poster") : null) : urlFor(item, item.hasThumb ? "thumb" : undefined);
  const rest = more.phone || more.wide;

  // A photo can fail before hydration attaches onError. A lazy one that hasn't started isn't `complete`, so this only reads one that has settled.
  const settled = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("group relative block aspect-square w-full overflow-hidden rounded-lg", video ? "bg-photo-stage" : "bg-fill-1")}
    >
      {src && !broken ? (
        // Gated, session-checked route; next/image would cache it publicly.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={settled}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        !video && <NoPreview name={item.filename} />
      )}
      {video && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-sm bg-photo-scrim px-1 py-0.5 text-micro tabular-nums text-on-photo">
          <Play className="size-3 fill-current" aria-hidden="true" />
          {length}
        </span>
      )}
      {item.internal && (
        <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-sm bg-photo-scrim text-on-photo">
          <Lock className="size-3.5" aria-hidden="true" />
        </span>
      )}
      <span className="sr-only">{tileName(item)}</span>
      {rest > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-photo-scrim text-label text-on-photo">
          {more.phone > 0 && (
            <span className={cn(more.wide > 0 || "sm:hidden")}>
              <span aria-hidden="true">+{more.phone}</span>
              <span className="sr-only">. Open all {more.noun}</span>
            </span>
          )}
          {more.wide > 0 && (
            <span className={cn(more.phone > 0 && "max-sm:hidden")}>
              <span aria-hidden="true">+{more.wide}</span>
              <span className="sr-only">. Open all {more.noun}</span>
            </span>
          )}
        </span>
      )}
      {/* The photo edge sits over the image, so a pale facade doesn't bleed into the page; a mouse steps it up. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg inset-shadow-photo-edge" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-1 ring-inset ring-line-control transition-opacity duration-fast pointer-fine:group-hover:opacity-100"
      />
    </button>
  );
}

/** What a tile draws when there's nothing to draw: a HEIC outside Safari says what it is, anything else is a broken photo. */
function NoPreview({ name }: { name: string }) {
  const look = documentLook(name);
  if (look.glyph === "image" && /^HEIF?$/.test(look.label)) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-fg-3">
        <FileImage className="size-5" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-micro">HEIC</span>
      </span>
    );
  }
  return (
    <span className="absolute inset-0 flex items-center justify-center text-fg-3">
      <ImageOff className="size-5" aria-hidden="true" />
    </span>
  );
}

/** One 48x36 thumb of the strip. A video shows its poster, or a dark tile with a play mark. */
function StripThumb({ item, urlFor, onOpen }: { item: MediaItem; urlFor: MediaUrlFor; onOpen: () => void }) {
  const video = item.kind === "VIDEO";
  const src = video ? (item.hasPoster ? urlFor(item, "poster") : null) : urlFor(item, item.hasThumb ? "thumb" : undefined);
  return (
    <button type="button" onClick={onOpen} aria-label={tileName(item)} className="relative block rounded-lg">
      {video && !src ? (
        <span className="relative flex h-9 w-12 items-center justify-center overflow-hidden rounded-lg bg-photo-stage inset-shadow-photo-edge">
          <Play className="size-4 fill-on-photo text-on-photo" aria-hidden="true" />
        </span>
      ) : (
        <PhotoThumb src={src} alt="" size={48} unoptimized />
      )}
      {video && src && (
        <Play className="absolute bottom-1 left-1 size-3 fill-on-photo text-on-photo drop-shadow" aria-hidden="true" />
      )}
      {/* The hit area reaches 44px on touch without changing the strip's height. */}
      <span aria-hidden="true" className="absolute -inset-1 pointer-fine:hidden" />
    </button>
  );
}
