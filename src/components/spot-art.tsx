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
 * Five drawings, one per payoff: all clear (the empty queue), a job done, a
 * move-in report sent, a request sent and a month closed.
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
  /** Job done: a clipboard with a check, its brass clip in gold. */
  "job-done": (
    <>
      <rect x="38" y="12" width="20" height="10" rx="2" className="fill-gold" />
      {/* The board, open at the top where the clip sits */}
      <path d="M38 17h-8a3 3 0 0 0-3 3v61a3 3 0 0 0 3 3h36a3 3 0 0 0 3-3V20a3 3 0 0 0-3-3h-8" />
      <path d="m38 49 7 7 14-15" />
      <path d="M38 68h20M38 75h12" />
    </>
  ),
  /** Move-in report sent: a key on a ring, the key's bow in gold. */
  "move-in-sent": (
    <>
      {/* The bow, with the hole the ring runs through */}
      <path
        fillRule="evenodd"
        className="fill-gold"
        d="M58 47a10 10 0 1 1-20 0a10 10 0 1 1 20 0ZM46.7 42.6a3 3 0 1 0-6 0a3 3 0 1 0 6 0Z"
      />
      <circle cx="34" cy="32" r="14" />
      {/* The blade and its two teeth */}
      <path d="M55.1 54.1 80 79M68.7 67.7l-4.2 4.2M74.4 73.4l-4.2 4.2" />
    </>
  ),
  /** Request sent: an envelope under a roofline, its attic window lit in gold. */
  "request-sent": (
    <>
      <rect x="44" y="27" width="8" height="8" rx="0.75" className="fill-gold" />
      {/* The roof, past the envelope's sides like an eave */}
      <path d="M14 44 48 15l34 29" />
      <rect x="20" y="44" width="56" height="38" rx="2" />
      <path d="m20 46 28 20 28-20" />
    </>
  ),
  /** Month closed: an open ledger, the right page ruled off twice, its ribbon in gold. */
  "month-closed": (
    <>
      <path d="M45 72h6v14l-3-3-3 3Z" className="fill-gold" />
      {/* Two pages and the spine */}
      <path d="M48 24c-8-6-20-8-34-6v54c14-2 26 0 34 6" />
      <path d="M48 24c8-6 20-8 34-6v54c-14-2-26 0-34 6" />
      <path d="M48 24v54" />
      <path d="M22 32h18M22 40h18M22 48h18M22 56h12" />
      {/* Entries, then the total's double rule */}
      <path d="M56 32h18M56 40h18M56 48h18" />
      <path d="M60 57h14M60 60h14" />
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
