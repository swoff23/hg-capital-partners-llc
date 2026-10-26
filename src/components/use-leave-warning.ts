"use client";
import { useEffect } from "react";

/**
 * While `active`, the browser asks before the page goes away: a reload,
 * closing the tab, a typed URL. In-app links don't fire beforeunload, and iOS
 * Safari never asks. Shared by the upload queue (files that a reload would
 * lose, when the outbox can't keep them) and by anything else a reload would
 * lose; media-uploader.tsx re-exports it under its old path.
 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Older Chrome and Safari still look for this.
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
