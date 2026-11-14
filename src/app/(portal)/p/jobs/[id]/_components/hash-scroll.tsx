"use client";
import { useEffect } from "react";

/**
 * Takes an email's anchor (`#lockbox`, `#updates`, `#update-<id>`) into view
 * once the job page is in. A cold open from an email streams the loading
 * screen first, where the browser finds no such id and lets the scroll go;
 * this mounts with the page itself, so the place is there. The staff app's
 * shell does the same for its pages (app-shell.tsx).
 */
export function HashScroll() {
  useEffect(() => {
    // Once per page load: Back or Forward remounts the page from the router's cache, and the browser's own scroll
    // position should stand then.
    if (scrolledThisLoad) return;
    scrolledThisLoad = true;
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // A hand-edited link with a stray %: use it as written.
    }
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}

/** Set once this document has taken its anchor into view. */
let scrolledThisLoad = false;
