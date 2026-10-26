"use client";
import { useState, type ReactNode } from "react";

/**
 * The rent roll grid's sideways scroll (charts 2.7). Twelve months, Total
 * and the property column need about 1,300px, so the grid scrolls in its
 * own box with the property column pinned (sticky, on --surface). While
 * it's scrolled, `data-scrolled` puts a --line rule on that column's right
 * edge, so the months clip under it (the Airtable frozen column). The page
 * still scrolls, so the header scrolls with it here (docs/components.md,
 * sticky headers on wide tables).
 */
export function GridFrame({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div
      data-scrolled={scrolled || undefined}
      onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)}
      className="group/grid w-full max-w-full overflow-x-auto"
    >
      {children}
    </div>
  );
}
