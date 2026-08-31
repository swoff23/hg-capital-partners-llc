"use client";
import { useState } from "react";

/**
 * A listing's photo, with left/right arrows when there's more than one. Not
 * wrapped in the card's outer link — arrows are real buttons, and a button
 * nested inside an <a> is invalid HTML, so the card itself stopped being one
 * big link (see rentals/page.tsx — "View on Zillow" is its own anchor now).
 */
export function PhotoCarousel({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-[#4c525c]">
        No photo yet
      </div>
    );
  }

  const go = (e: React.MouseEvent, direction: -1 | 1) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + direction + photos.length) % photos.length);
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, fine unoptimized */}
      <img src={photos[index]} alt="" className="h-full w-full object-cover" />

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#08090b]/70 text-[#e8eaee] opacity-0 transition-opacity group-hover:opacity-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#08090b]/70 text-[#e8eaee] opacity-0 transition-opacity group-hover:opacity-100"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {photos.map((_, i) => (
              <span
                key={i}
                className={"h-1 w-1 rounded-full " + (i === index ? "bg-[#e8eaee]" : "bg-[#e8eaee]/30")}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
