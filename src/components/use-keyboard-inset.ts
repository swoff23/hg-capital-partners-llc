"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * How much of the bottom of the layout viewport the on-screen keyboard
 * covers, in whole pixels: the layout height less the visual viewport's
 * bottom edge. 0 with no keyboard, with no visualViewport, and wherever the
 * page itself resizes for the keyboard (Android Chrome under the
 * `interactiveWidget: "resizes-content"` viewport), since the two viewports
 * then match and nothing lifts twice.
 */
export function keyboardInset(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number } | null | undefined,
): number {
  if (!viewport) return 0;
  const covered = Math.round(layoutHeight - viewport.height - viewport.offsetTop);
  return covered > 0 ? covered : 0;
}

function subscribe(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const read = () => keyboardInset(window.innerHeight, window.visualViewport);

// Several parts can need the inset at once (a sheet and a composer); the
// variable stays on the root until the last one lets go.
let holders = 0;

/**
 * Tracks the on-screen keyboard (forms 2.9, activity 2.7). While a component
 * using it is mounted, `--kb-inset` on the root holds how far the keyboard
 * covers the page ("0px" with none), so a phone sheet's footer and a docked
 * composer ride above it: `bottom: var(--kb-inset, 0px)`. Returns the same
 * number for layout that needs it in script. Android Chrome resizes the page
 * itself (the (app) layout's viewport), so this reads 0 there.
 */
export function useKeyboardInset(): number {
  const inset = useSyncExternalStore(subscribe, read, () => 0);

  useEffect(() => {
    holders++;
    return () => {
      holders--;
      if (holders === 0) document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
  }, [inset]);

  return inset;
}
