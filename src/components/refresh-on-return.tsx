"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { todayYmdEastern } from "@/lib/dates";
import { shouldRefresh, type ReturnTrigger } from "@/lib/refresh-on-return";

/** How often a showing tab checks whether the Eastern day has rolled over. */
const CLOCK_MS = 60_000;

/**
 * True while the page holds typing a refresh could lose: a focused field, or
 * one typed into and not saved. After a deploy a refresh reloads the whole
 * page, and a form keyed by its record's version remounts. Controlled fields
 * always match their default, so this catches the uncontrolled forms (the
 * New task, deal and property forms, the property cards);
 * lib/refresh-on-return.ts holds the pages whose controlled editors can't
 * survive a refresh yet.
 */
function holdsTyping(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches("input, textarea, select, [contenteditable]")) return true;
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
    if (el.value !== el.defaultValue) return true;
  }
  return false;
}

/**
 * Keeps a tab that's left open current: re-fetches the page's server data
 * when someone comes back to it (lib/refresh-on-return.ts says when). A
 * refresh keeps client state; only the server-rendered data updates. Mounted
 * once in the app layout; renders nothing.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let loadedDay = todayYmdEastern();
    let lastAt = Date.now();
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;

    function consider(trigger: ReturnTrigger) {
      const now = Date.now();
      const today = todayYmdEastern();
      if (!shouldRefresh(trigger, { pathname, loadedDay, today, sinceLastMs: now - lastAt })) return;
      // Left for the next return, which asks again.
      if (holdsTyping()) return;
      loadedDay = today;
      lastAt = now;
      router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenMs = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      consider({ kind: "visible", hiddenMs });
    }
    const onOnline = () => consider({ kind: "online" });
    const onPageShow = (e: PageTransitionEvent) => consider({ kind: "pageshow", persisted: e.persisted });
    const clock = window.setInterval(() => {
      if (document.visibilityState === "visible") consider({ kind: "clock" });
    }, CLOCK_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(clock);
    };
  }, [router, pathname]);

  return null;
}
