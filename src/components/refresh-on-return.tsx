"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUnsavedWork } from "@/components/leave-guard";
import { todayYmdEastern } from "@/lib/dates";
import { ONLINE_SETTLE_MS, shouldRefresh, type ReturnTrigger } from "@/lib/refresh-on-return";

/** How often a showing tab checks whether the Eastern day has rolled over. */
const CLOCK_MS = 60_000;

/**
 * True while the page holds typing a refresh could lose: a focused field, or
 * one typed into and not saved. After a deploy a refresh reloads the whole
 * page, and a form keyed by its record's version remounts. Controlled fields
 * always match their default, so this catches only the uncontrolled ones;
 * a controlled draft is told by the LeaveGuard instead (`useUnsavedWork`),
 * and lib/refresh-on-return.ts holds the pages whose editors don't place a
 * hold yet.
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
 * refresh keeps client state; only the server-rendered data updates. It
 * waits while unsaved work is on the page (a dirty sheet, editor or draft
 * holds the LeaveGuard) and asks again on the next return. Mounted once in
 * the app layout, inside the LeaveGuard; renders nothing.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  const pathname = usePathname();
  const unsaved = useRef(false);
  const held = useUnsavedWork();
  useEffect(() => {
    unsaved.current = held;
  }, [held]);

  useEffect(() => {
    let loadedDay = todayYmdEastern();
    let lastAt = Date.now();
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;

    function consider(trigger: ReturnTrigger) {
      const now = Date.now();
      const today = todayYmdEastern();
      const state = { pathname, loadedDay, today, sinceLastMs: now - lastAt, online: navigator.onLine, unsaved: unsaved.current };
      if (!shouldRefresh(trigger, state)) return;
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
    let onlineTimer: number | undefined;
    function onOnline() {
      window.clearTimeout(onlineTimer);
      onlineTimer = window.setTimeout(() => consider({ kind: "online" }), ONLINE_SETTLE_MS);
    }
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
      window.clearTimeout(onlineTimer);
    };
  }, [router, pathname]);

  return null;
}
