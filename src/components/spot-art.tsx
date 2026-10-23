import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Line art for payoff and empty-queue moments (docs/brand-guidelines.md,
 * section 6): 1.5 strokes in --fg-1 on a 96 grid (72px on phones), exactly
 * one --gold fill per drawing, colors from tokens so it follows the theme.
 * Decorative, so aria-hidden; the heading beside it carries the meaning.
 * Never in rows, toasts or dialogs, and a payoff tied to a property shows
 * that property's photo instead.
 *
 * One drawing so far. The other four (a clipboard with a check, a key on a
 * ring, an envelope with a roofline, an open ledger) ship one at a time.
 */
const ART = {
  /** All clear: a Buffalo double, two flats over two porches, one door lit in gold. */
  "all-clear": (
    <>
      {/* The door to the upper flat, lit: the drawing's one gold fill */}
      <rect x="58" y="69" width="7" height="15" rx="0.75" className="fill-gold" />
      {/* Ground */}
      <path d="M10 84h76" />
      {/* Front gable, with its eave overhang and the attic window */}
      <path d="M20 40 48 14l28 26" />
      <path d="M24 36.3V84M72 36.3V84M24 40h48" />
      <rect x="44" y="25" width="8" height="8" rx="0.75" />
      {/* Upper flat: two windows behind the upper porch rail */}
      <rect x="30" y="44" width="11" height="11" rx="0.75" />
      <rect x="55" y="44" width="11" height="11" rx="0.75" />
      <path d="M24 58h48M30 58v6M36 58v6M42 58v6M48 58v6M54 58v6M60 58v6M66 58v6" />
      {/* The porch roof between the flats, past the walls like an eave */}
      <path d="M20 64h56" />
      {/* Lower flat: the front window and the two doors */}
      <rect x="31" y="69" width="12" height="10" rx="0.75" />
      <rect x="48" y="69" width="7" height="15" rx="0.75" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type SpotArtName = keyof typeof ART;

export function SpotArt({ name, className }: { name: SpotArtName; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-24 w-24 shrink-0 text-fg-1 max-sm:h-18 max-sm:w-18", className)}
    >
      {ART[name]}
    </svg>
  );
}
