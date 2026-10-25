"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, House } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A listing's photos as a borderless 4:3 strip, rounded-lg
 * (docs/brand-guidelines.md, sections 6 and 10). On touch the photos swipe
 * (a scroll-snap strip, so the browser does the gesture); with a mouse,
 * arrows show on hover or keyboard focus. A "1 / 8" counter sits bottom right
 * and `status` ("Leased", "Available Nov 1") is a pill top left, both on the
 * fixed photo tokens. No photos is the House fallback tile.
 *
 * Plain <img>: listing photos are public Vercel Blob URLs, fine unoptimized.
 * Not inside a link: the arrows are real buttons, and a button nested in an
 * <a> is invalid HTML.
 */
export function PhotoCarousel({ photos, label, status }: { photos: string[]; label: string; status?: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  function onScroll() {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  // Scrolls the strip; onScroll moves the counter. Smooth unless reduced
  // motion is on (scroll-smooth, which globals.css turns off for it).
  function go(direction: -1 | 1) {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: ((index + direction + count) % count) * el.clientWidth });
  }

  return (
    <div className="group/photo relative aspect-4/3 overflow-hidden rounded-lg bg-fill-1">
      {count === 0 ? (
        <span role="img" aria-label={`${label}, no photo yet`} className="absolute inset-0 flex items-center justify-center text-fg-3">
          <House aria-hidden="true" strokeWidth={1.5} className="aspect-square h-2/5 w-auto" />
        </span>
      ) : (
        <div
          ref={strip}
          onScroll={onScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, fine unoptimized
            <img
              key={`${i}-${src}`}
              src={src}
              alt={count > 1 ? `${label}, photo ${i + 1} of ${count}` : label}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="h-full w-full shrink-0 snap-center snap-always object-cover"
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

/** A 32px arrow on the photo pill's tokens: shown on hover or keyboard focus with a mouse, never on touch, where the strip swipes. */
function arrowClass(side: string) {
  return cn(
    "absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-pill-bg text-pill-fg",
    "opacity-0 transition-opacity group-hover/photo:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden",
    side,
  );
}
