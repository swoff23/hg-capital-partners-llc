"use client";
import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** A wait shorter than this shows no spinner at all (docs/brand-guidelines.md, section 7). */
export const SPINNER_DELAY_MS = 200;
/** Once shown, the spinner stays at least this long, so it never flickers. */
export const SPINNER_MIN_MS = 400;

/**
 * Whether a spinner for `active` work should show: after SPINNER_DELAY_MS of
 * it, then for at least SPINNER_MIN_MS, even if the work ends sooner.
 */
export function useSpinnerVisible(active: boolean): boolean {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (active && shownAt === null) {
      const t = setTimeout(() => setShownAt(Date.now()), SPINNER_DELAY_MS);
      return () => clearTimeout(t);
    }
    if (!active && shownAt !== null) {
      const t = setTimeout(() => setShownAt(null), Math.max(0, shownAt + SPINNER_MIN_MS - Date.now()));
      return () => clearTimeout(t);
    }
  }, [active, shownAt]);
  return shownAt !== null;
}

/**
 * The one spinner glyph, lucide's LoaderCircle (forms 2.7, search 2.13). It
 * appears after 200ms of `active` work and stays at least 400ms; until then
 * it shows `children` (nothing, or the icon it stands in for, such as a search
 * field's magnifier, so nothing moves). 16px in the current text color by
 * default; under reduced motion it shows and holds still. Hidden from screen
 * readers: the control it sits in says it's busy (`aria-busy`).
 */
export function Spinner({
  active = true,
  className,
  children = null,
}: {
  active?: boolean;
  className?: string;
  /** Shown while the spinner isn't. */
  children?: ReactNode;
}) {
  const visible = useSpinnerVisible(active);
  if (!visible) return children;
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-4 shrink-0 animate-spin motion-reduce:animate-none", className)}
    />
  );
}
