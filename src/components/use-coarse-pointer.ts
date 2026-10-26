"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True on a touch screen (phones, tablets), the same test as Tailwind's
 * `pointer-coarse:` variant. Pickers use it to open a Sheet instead of a
 * Popover. False during server render and hydration, then the real value.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Where a picker or value menu opens (docs/specs/selectors.md 2 and 4.2 A). */
export type PickContainer = "popover" | "sheet";

/** Tailwind's `md`: below it a touch screen is a phone. */
const TABLET_UP_QUERY = "(min-width: 48rem)";

/**
 * A titled bottom sheet on a touch phone; an anchored popover with a mouse
 * and on a touch tablet, which gets touch rows instead (4.2 A).
 */
export function containerFor({ coarse, phone }: { coarse: boolean; phone: boolean }): PickContainer {
  return coarse && phone ? "sheet" : "popover";
}

/**
 * The container for a picker, read when its trigger is pressed rather than
 * at render, so a tap before hydration (when useCoarsePointer is still false)
 * can't open the desktop popover on a phone. Call it in the press handler:
 *
 *   onPress={() => setOpen(pickContainer())}
 */
export function pickContainer(): PickContainer {
  if (typeof window === "undefined") return "popover";
  return containerFor({ coarse: window.matchMedia(QUERY).matches, phone: !window.matchMedia(TABLET_UP_QUERY).matches });
}
