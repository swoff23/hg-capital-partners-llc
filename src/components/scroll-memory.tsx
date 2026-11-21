"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LOADING_SCREEN_SELECTOR } from "@/lib/loading-screen";

/** How long Back keeps trying to reach the old place while the page loads. */
const SETTLE_MS = 10_000;

/** What the reader does that means they've moved on, so the page isn't pulled out from under them. */
const MOVED_ON = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/** Where the places wait while the tab loads a page in full, and how many addresses it keeps. */
const STORE_KEY = "hg:scroll-places";
const STORE_MAX = 50;

type Goal = { key: string; y: number };

/** An address without its hash: a link to a place on a page is the same page. */
function here(): string {
  return window.location.pathname + window.location.search;
}

function readPlaces(): Map<string, number> {
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? "[]");
    if (Array.isArray(saved)) {
      return new Map(saved.filter((e): e is [string, number] => typeof e?.[0] === "string" && typeof e?.[1] === "number"));
    }
  } catch {
    // Storage blocked or the entry unreadable: start empty.
  }
  return new Map();
}

function savePlaces(places: Map<string, number>) {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify([...places].slice(-STORE_MAX)));
  } catch {
    // Storage blocked or full: Back after a full load starts where the browser puts it.
  }
}

/**
 * The address this document loaded at, when the browser loaded it to put a page back: Back or Forward
 * to a page that was loaded in full, or Reload. After a deploy the next in-app link loads its page in
 * full (UpdateNotice), and so does a tap before the page is ready.
 */
function putBackAt(): string | null {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type !== "back_forward" && nav?.type !== "reload") return null;
  const url = new URL(nav.name);
  return url.pathname + url.search;
}

/**
 * Back and Forward put a page back where it was left: the Tasks list opens
 * at the row you came from, not at the top.
 *
 * The browser does this itself while the router still holds the page. Any
 * edit drops what the router holds (the services' revalidatePath), and so
 * does a refresh (RefreshOnReturn), so Back after either loads the page
 * again: its loading screen comes in first, too short to hold the old place,
 * and the browser's scroll lands at the top. A page loaded in full lands the
 * same way. This keeps each address's last place, in the tab's session
 * storage across full loads, and after Back or Forward scrolls there once
 * the page is in, unless the reader scrolls, taps or types first.
 *
 * Mounted once in the app layout; renders nothing.
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const places = useRef(new Map<string, number>());
  const goal = useRef<Goal | null>(null);
  // The address whose page is in, so a Back that only changes the hash (the same page) is left to the browser.
  const shown = useRef<string | null>(null);

  // Each address's last place, and the one Back or Forward goes to.
  useEffect(() => {
    places.current = readPlaces();
    const first = putBackAt();
    // Only the page the document loaded at; one reached in the app since has its own Back.
    const firstY = first === here() ? places.current.get(first) : undefined;
    if (first && firstY) goal.current = { key: first, y: firstY };

    const record = () => {
      // While Back waits for its page, the loading screen's short scroll isn't the reader's.
      if (goal.current) return;
      const key = here();
      // Most recent last, so the store keeps the latest addresses.
      places.current.delete(key);
      places.current.set(key, window.scrollY);
    };
    const onPopState = () => {
      const key = here();
      const y = places.current.get(key);
      goal.current = key !== shown.current && y ? { key, y } : null;
    };
    const onPageHide = () => savePlaces(places.current);
    window.addEventListener("scroll", record, { passive: true });
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", record);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
      savePlaces(places.current);
    };
  }, []);

  // The router has put the address's page, or its loading screen, in: take the reader back to their place.
  useEffect(() => {
    shown.current = here();
    const target = goal.current;
    if (!target) return;
    if (target.key !== shown.current) {
      goal.current = null;
      return;
    }
    const main = document.getElementById("main");
    let timer = 0;
    const observer = new MutationObserver(() => place());
    const done = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const kind of MOVED_ON) window.removeEventListener(kind, done, true);
      if (goal.current === target) goal.current = null;
    };
    const place = () => {
      if (main?.querySelector(LOADING_SCREEN_SELECTOR)) return;
      if (Math.abs(window.scrollY - target.y) > 1) window.scrollTo(0, target.y);
      // A page still filling in can be too short for the old place yet; keep at it until it fits.
      if (Math.abs(window.scrollY - target.y) <= 1) done();
    };
    for (const kind of MOVED_ON) window.addEventListener(kind, done, { capture: true, passive: true });
    if (main) observer.observe(main, { childList: true, subtree: true });
    timer = window.setTimeout(done, SETTLE_MS);
    place();
    return done;
  }, [pathname, search]);

  return null;
}
