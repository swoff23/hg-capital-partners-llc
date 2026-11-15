"use client";
import { useEffect } from "react";

const CONFIRMED_MS = 2000;
let confirmedAt = -Infinity;

/** The LeaveGuard calls this when the person picks the sheet's way out, so a guarded warning stands down for the reload that follows (the update notice's Reload anyway). */
export function leaveConfirmed() {
  confirmedAt = Date.now();
}

/**
 * While `active`, the browser asks before the page goes away: a reload,
 * closing the tab, a typed URL. In-app links don't fire beforeunload, and iOS
 * Safari never asks. Shared by the upload queue (files that a reload would
 * lose, when the outbox can't keep them), by a multi-line note open in place
 * with unsaved text (inline-field.tsx; one-line fields save on blur and never
 * ask), and by anything else a reload would lose. `guarded` is for a caller
 * that also holds the LeaveGuard: a leave the guard already confirmed isn't
 * asked about a second time (docs/specs/update-notice.md 3.5).
 */
export function useLeaveWarning(active: boolean, { guarded = false }: { guarded?: boolean } = {}) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      // The app's own sheet just asked and the person said leave: don't ask twice.
      if (guarded && Date.now() - confirmedAt < CONFIRMED_MS) return;
      e.preventDefault();
      e.returnValue = ""; // Older Chrome and Safari still look for this.
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, guarded]);
}
