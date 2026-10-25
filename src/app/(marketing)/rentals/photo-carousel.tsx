"use client";
import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, House } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A listing's photos as a borderless 4:3 strip, rounded-lg
 * (docs/brand-guidelines.md, sections 6 and 10). On touch the photos swipe
 * (a scroll-snap strip, so the browser does the gesture); with a mouse,
 * arrows show on hover or keyboard focus. A "1 / 8" counter sits bottom right
 * and `status` ("Leased", "Available Nov 1") is a pill top left, both on the
 * fixed photo tokens. Each photo fades in over the --fill-1 placeholder; no
 * photos, or one that fails to load, is the House fallback tile.
 *
 * Plain <img>: listing photos are public Vercel Blob URLs, fine unoptimized.
 * Not inside a link: the arrows are real buttons, and a button nested in an
 * <a> is invalid HTML.
 */
export function PhotoCarousel({ photos, label, status }: { photos: string[]; label: string; status?: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The slide the arrows head for. The counter follows the scroll, which only
  // passes halfway partway through a smooth scroll, so two quick clicks need
  // their own count; it resyncs once scrolling settles (a swipe moves it too).
  const target = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const count = photos.length;

  function onScroll() {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    const at = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    setIndex(at);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      target.current = at;
    }, 150);
  }

  // Scrolls the strip; onScroll moves the counter. Smooth unless reduced
  // motion is on (scroll-smooth, which globals.css turns off for it).
  function go(direction: -1 | 1) {
    const el = strip.current;
    if (!el) return;
    clearTimeout(settle.current);
    target.current = (target.current + direction + count) % count;
    el.scrollTo({ left: target.current * el.clientWidth });
  }

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
              eager={i === 0}
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
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className={arrowClass("right-3")}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
          <span
            aria-hidden="true"
            className="num pointer-events-none absolute bottom-3 right-3 inline-flex h-6 items-center rounded-full bg-photo-scrim px-2 text-micro text-on-photo"
          >
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * One slide: the photo fades in over 200ms once it loads (PhotoThumb's
 * loading, section 6), and a URL that's gone becomes the fallback tile rather
 * than the browser's broken-image glyph under the pills.
 */
function StripPhoto({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
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
    // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, fine unoptimized
    <img
      ref={settled}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
      className={cn(
        slide,
        "object-cover opacity-0 transition-opacity duration-photo motion-reduce:transition-none",
        loaded && "opacity-100",
      )}
    />
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
