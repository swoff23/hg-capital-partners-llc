"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FIND_PARAM, findElementId, isFieldTarget } from "@/lib/find-target";
import { revealPropertyField } from "./edit-field-event";

/** How long the found line holds its tint; it then clears as any color change does (--dur-fast, brand guidelines 7). */
const TINT_MS = 2000;
/** Frames to wait for the line: a folded Loan or Insurance row comes out a render after it's asked for. */
const TRIES = 30;

/**
 * A search hit on a hidden field links here with `?find=<target>`
 * (lib/find-target.ts, docs/specs/search-deeper-fields.md 5). Once the page is
 * in, the line's Utilities or Equipment opens (or its folded Loan or Insurance
 * row comes out), the line scrolls to the middle of the screen, and it takes
 * the menu highlight's --accent ground for about 2 seconds. The address drops
 * the request so a reload doesn't land again, as FillOnArrival does. It reads
 * the address through useSearchParams, so a hit on the property already open
 * lands too.
 */
export function FindOnArrival() {
  const target = useSearchParams().get(FIND_PARAM);
  useEffect(() => {
    if (!target) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(FIND_PARAM);
    // Null state: Next copies its own into the entry and syncs useSearchParams, so the same hit picked again
    // lands again and ?find= doesn't come back on the next router update. Passing history.state skips that sync.
    window.history.replaceState(null, "", url);
    let tries = 0;
    const land = () => {
      const line = document.getElementById(findElementId(target));
      if (!line) {
        // The sections subscribe as they mount, so the request is asked again each frame until the row is out.
        if (isFieldTarget(target)) revealPropertyField(target);
        if (++tries < TRIES) requestAnimationFrame(land);
        return;
      }
      const disclosure = line.closest("details");
      if (disclosure) disclosure.open = true;
      line.scrollIntoView({ block: "center" });
      tint(line);
    };
    requestAnimationFrame(land);
    // No cleanup: dropping the parameter renders this again with none, and the landing still has to finish.
  }, [target]);
  return null;
}

/** The found line's moment of --accent. Reduced motion clears it at once (the globals.css block). */
function tint(line: HTMLElement) {
  line.style.backgroundColor = "var(--accent)";
  window.setTimeout(() => {
    line.style.transition = "background-color var(--dur-fast) ease-out";
    line.style.backgroundColor = "";
    window.setTimeout(() => {
      line.style.transition = "";
    }, 200);
  }, TINT_MS);
}
