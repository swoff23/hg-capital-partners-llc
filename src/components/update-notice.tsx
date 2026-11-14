"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLeaveGuard, useUnsavedWork } from "@/components/leave-guard";
import { useToast } from "@/components/toast";
import { useUploadEngine } from "@/components/upload-queue";
import {
  CHECK_EVERY_MS,
  CHECK_GAP_MS,
  DISMISSED_KEY,
  RELOAD_ANYWAY,
  UPDATE_LINE,
  UPDATE_LINE_PHONE,
  UPDATE_TOAST_KEY,
  fullLoadHref,
  updateState,
} from "@/lib/app-version";
import { RELOAD_LABEL, reloadPage } from "@/lib/lazy-module";
import { ONLINE_SETTLE_MS } from "@/lib/refresh-on-return";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, version);
  } catch {}
}

/**
 * Tells a tab left open that a new version is live (docs/specs/update-notice.md).
 * `version` is the commit the page loaded with, from its layout; null (local
 * dev) turns it off. It asks /api/version when the tab is shown again, when
 * the connection comes back, when Safari restores the page, and every 5
 * minutes while the tab is showing.
 *
 * A new version shows a sticky toast: "A new version is ready" with Reload,
 * the whole pill one button. Reload asks first through the LeaveGuard while
 * unsaved work holds it ("Reload anyway"). × or Esc hides the toast until the
 * next deploy (remembered in this browser). Either way, the next plain click
 * on an in-app link loads its page in full instead of swapping it in, unless
 * the page holds unsaved work or an upload a reload would lose: that click
 * goes on as usual, so the guard asks, and a later link takes the update.
 *
 * Mounted once in the app layout and once in the portal layout, inside the
 * upload queue and under the toasts and the LeaveGuard. Renders nothing.
 */
export function UpdateNotice({ version }: { version: string | null }) {
  const { toast, dismiss } = useToast();
  const guard = useLeaveGuard({ leaveLabel: RELOAD_ANYWAY });
  const unsaved = useUnsavedWork();
  const engine = useUploadEngine();
  // The live version, once it differs from the one this page loaded with.
  const [live, setLive] = useState<string | null>(null);

  const holding = useRef(unsaved);
  useEffect(() => {
    holding.current = unsaved;
  }, [unsaved]);

  // Asks which version is live.
  useEffect(() => {
    if (!version) return;
    let lastAt = Date.now();
    let gone = false;

    async function check() {
      const now = Date.now();
      if (now - lastAt < CHECK_GAP_MS || !navigator.onLine) return;
      lastAt = now;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const body: unknown = await res.json();
        const seen = body && typeof body === "object" && "version" in body ? body.version : null;
        // A failed or empty answer changes nothing; the next trigger asks again.
        if (gone || typeof seen !== "string" || seen === "") return;
        setLive(seen === version ? null : seen);
      } catch {}
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    let onlineTimer: number | undefined;
    function onOnline() {
      window.clearTimeout(onlineTimer);
      onlineTimer = window.setTimeout(() => void check(), ONLINE_SETTLE_MS);
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHECK_EVERY_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(timer);
      window.clearTimeout(onlineTimer);
    };
  }, [version]);

  // Reload, through the LeaveGuard. True when the page is going away now (the toast's icon spins).
  const reload = useCallback((): boolean => {
    let going = false;
    guard(() => {
      going = true;
      reloadPage();
    });
    return going;
  }, [guard]);

  // The toast: shown for a new version, replaced by a later one, taken down if the live version comes back to ours.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (updateState(version, live, readDismissed()) === "toast" && live) {
      shown.current = toast({
        key: UPDATE_TOAST_KEY,
        message: UPDATE_LINE,
        phoneMessage: UPDATE_LINE_PHONE,
        icon: RefreshCw,
        sticky: true,
        action: { label: RELOAD_LABEL, onAction: reload },
        onDismiss: () => {
          writeDismissed(live);
          shown.current = null;
        },
      });
    } else if (shown.current !== null) {
      dismiss(shown.current);
      shown.current = null;
    }
  }, [version, live, toast, dismiss, reload]);

  // The next plain in-app link loads its page in full. A capture listener on window runs before React's, so Next's
  // Link never starts a client navigation.
  useEffect(() => {
    if (!live) return;
    function onClick(e: MouseEvent) {
      if (holding.current || engine?.needsLeaveWarning()) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const link = a instanceof HTMLAnchorElement ? { href: a.href, target: a.target, download: a.hasAttribute("download") } : null;
      const href = fullLoadHref(e, link, window.location.href);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(href);
    }
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [live, engine]);

  return null;
}
