"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ChevronLeft, ChevronRight, House } from "lucide-react";
import type { MediaItem } from "@/components/lightbox";
import { cn } from "@/lib/utils";

// The full-screen viewer comes in on the first tap, so a page of listings doesn't carry it.
const Lightbox = dynamic(() => import("@/components/lightbox").then((m) => m.Lightbox), { ssr: false });

/**
 * A listing's photos as a borderless 4:3 strip, rounded-lg
 * (docs/brand-guidelines.md, sections 6 and 10). On touch the photos swipe
 * (a scroll-snap strip, so the browser does the gesture); with a mouse,
 * arrows show on hover or keyboard focus. A "1 / 8" counter sits bottom right
 * and `status` ("Leased", "Available Nov 1") is a pill top left, both on the
 * fixed photo tokens. Each photo fades in over the --fill-1 placeholder; no
 * photos, or one that fails to load, is the House fallback tile.
 *
 * Photos are `next/image` at the column's width (3, 2 and 1 columns), not the
 * originals (uploads 2.12, PUBLIC-029). The next photo starts loading once
 * the strip settles, or when an arrow gets hover or focus, so a swipe or a
 * click lands on a photo that's there (G1D-028). When a swipe settles, "Photo
 * 2 of 5" is announced politely; the visible counter stays `aria-hidden`
 * (PUBLIC-030).
 *
 * A tap or click on a photo opens it full screen at that photo, in the
 * viewer on the public surface: the listing's `viewerTitle` ("56 Tamarack St
 * · $1,450/mo") over the photo, the counter, arrows, zoom and swipe, with no
 * byline or Download (G1D-021). Only one slide is a Tab stop, the one in
 * view. Not inside a link: the arrows and the slides are real buttons, and a
 * button nested in an <a> is invalid HTML.
 */
export function PhotoCarousel({
  photos,
  label,
  status,
  viewerTitle,
}: {
  photos: string[];
  label: string;
  status?: string;
  /** The viewer's header over the photo: the street and, for an open listing, its rent. */
  viewerTitle?: ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // How far ahead photos load: the one after the one in view, and further as the strip settles or an arrow is aimed at.
  const [warm, setWarm] = useState(1);
  const [announced, setAnnounced] = useState("");
  // The viewer wants a time for each photo; the public one shows no byline, so this is never read out.
  const [stamp] = useState(() => new Date());
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  // The slide the arrows head for. The counter follows the scroll, which only
  // passes halfway partway through a smooth scroll, so two quick clicks need
  // their own count; it resyncs once scrolling settles (a swipe moves it too).
  const target = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const count = photos.length;

  const warmTo = useCallback(
    (to: number) => setWarm((w) => Math.max(w, Math.min(count - 1, to))),
    [count],
  );

  function onScroll() {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    const at = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    setIndex(at);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      target.current = at;
      warmTo(at + 1);
      // Said once the swipe has come to rest, not on every photo it passes.
      setAnnounced(count > 1 ? `Photo ${at + 1} of ${count}` : "");
    }, 150);
  }
  useEffect(() => () => clearTimeout(settle.current), []);

  // Scrolls the strip; onScroll moves the counter. Smooth unless reduced
  // motion is on (scroll-smooth, which globals.css turns off for it).
  function go(direction: -1 | 1) {
    const el = strip.current;
    if (!el) return;
    clearTimeout(settle.current);
    target.current = (target.current + direction + count) % count;
    el.scrollTo({ left: target.current * el.clientWidth });
  }

  function openViewer(at: number) {
    warmTo(at + 1);
    setViewer({ open: true, index: at });
  }

  // The strip follows the photo the viewer was left on.
  function onViewerOpenChange(open: boolean) {
    setViewer((v) => ({ ...v, open }));
    const el = strip.current;
    if (!open && el && el.clientWidth > 0) {
      target.current = viewer.index;
      el.scrollTo({ left: viewer.index * el.clientWidth, behavior: "instant" });
    }
  }

  const items: MediaItem[] = photos.map((_, i) => ({
    id: String(i),
    kind: "IMAGE",
    filename: `${label} photo ${i + 1}`,
    createdAt: stamp,
  }));

  return (
    <div className="group/photo relative aspect-4/3 overflow-hidden rounded-lg bg-fill-1">
      {count === 0 ? (
        <FallbackTile label={`${label}, no photo yet`} className="absolute inset-0" />
      ) : (
        <div
          ref={strip}
          onScroll={onScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((src, i) => (
            <StripPhoto
              key={`${i}-${src}`}
              src={src}
              alt={count > 1 ? `${label}, photo ${i + 1} of ${count}` : label}
              eager={i === 0 || i <= warm}
              tabbable={i === index}
              onOpen={() => openViewer(i)}
            />
          ))}
        </div>
      )}

      {/* The photo edge, so a pale facade doesn't bleed into the page. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] inset-shadow-photo-edge" />

      {status && (
        <span className="absolute left-3 top-3 inline-flex h-6 items-center rounded-full bg-pill-bg px-2 text-micro text-pill-fg">
          {status}
        </span>
      )}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className={arrowClass("left-3")}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            onPointerEnter={() => warmTo(index + 1)}
            onFocus={() => warmTo(index + 1)}
            aria-label="Next photo"
            className={arrowClass("right-3")}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
          <span
            aria-hidden="true"
            className="num pointer-events-none absolute bottom-3 right-3 inline-flex h-6 items-center rounded-full bg-photo-scrim px-2 text-micro text-on-photo"
          >
            {index + 1} / {count}
          </span>
          <span role="status" aria-live="polite" className="sr-only">
            {announced}
          </span>
        </>
      )}

      {viewer.open && (
        <Lightbox
          items={items}
          index={viewer.index}
          onIndexChange={(at) => {
            warmTo(at + 1);
            setViewer((v) => ({ ...v, index: at }));
          }}
          isOpen={viewer.open}
          onOpenChange={onViewerOpenChange}
          urlFor={(item) => photos[Number(item.id)] ?? ""}
          surface="public"
          header={{ title: viewerTitle ?? label }}
        />
      )}
    </div>
  );
}

/**
 * One slide: the photo fades in over 200ms once it loads (PhotoThumb's
 * loading, section 6), and a URL that's gone becomes the fallback tile rather
 * than the browser's broken-image glyph under the pills. The slide is the
 * button that opens it full screen.
 */
function StripPhoto({
  src,
  alt,
  eager,
  tabbable,
  onOpen,
}: {
  src: string;
  alt: string;
  eager: boolean;
  tabbable: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  // A photo can finish (or fail) before hydration attaches onLoad and onError.
  // A lazy one that hasn't started isn't `complete`, so this only reads one
  // that has settled.
  const settled = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else setBroken(true);
  }, []);

  const slide = "h-full w-full shrink-0 snap-center snap-always";
  if (broken) return <FallbackTile label={alt} className={slide} />;

  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={tabbable ? 0 : -1}
      aria-haspopup="dialog"
      className={cn(slide, "relative block cursor-zoom-in overflow-hidden")}
    >
      <Image
        ref={settled}
        src={src}
        alt={alt}
        fill
        // The grid is 3, 2 and 1 columns at 1280, 768 and 375 (section 10).
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setBroken(true)}
        className={cn(
          "object-cover opacity-0 transition-opacity duration-photo motion-reduce:transition-none",
          loaded && "opacity-100",
        )}
      />
    </button>
  );
}

/** The House tile on --fill-1 (section 6, Fallback): no photos yet, or one that won't load. */
function FallbackTile({ label, className }: { label: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("flex items-center justify-center bg-fill-1 text-fg-3", className)}
    >
      <House aria-hidden="true" strokeWidth={1.5} className="aspect-square h-2/5 w-auto" />
    </span>
  );
}

/** A 32px arrow on the photo pill's tokens, at the button radius: shown on hover or keyboard focus with a mouse, never on touch, where the strip swipes. */
function arrowClass(side: string) {
  return cn(
    "absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md bg-pill-bg text-pill-fg",
    "opacity-0 transition-opacity group-hover/photo:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden",
    side,
  );
}
