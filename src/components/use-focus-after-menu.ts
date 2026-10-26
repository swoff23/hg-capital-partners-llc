"use client";
import { useEffect, type RefObject } from "react";

/**
 * Focuses (and selects) an input that a menu item just opened ("Rename"):
 * the menu keeps focus inside itself until it has finished closing, then
 * gives it back to its button, so an input that grabs focus on mount loses it
 * a moment later and the first keystrokes go nowhere. This waits for the menu
 * to be gone, at most a second, then takes focus.
 */
export function useFocusAfterMenu(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const tick = () => {
      const el = ref.current;
      if (!el) return;
      if (document.querySelector('[role="menu"]') && tries++ < 60) {
        frame = requestAnimationFrame(tick);
        return;
      }
      el.focus();
      el.select();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref]);
}
