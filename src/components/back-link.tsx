"use client";
import { useRouter } from "next/navigation";
import { useLeaveGuard } from "@/components/leave-guard";
import { cn } from "@/lib/utils";

/**
 * True when the history entry behind this one is a page of ours, so Back
 * restores it with its filters and scroll.
 *
 * The referrer alone can't tell: it's fixed when the document loads and
 * client-side navigations never change it, so someone who signed in or
 * opened the app from a text or an email has an empty one for the whole
 * visit. A document that has moved on from the URL it loaded at has
 * navigated inside the app, so the previous entry is ours.
 */
function cameFromApp(): boolean {
  if (window.history.length <= 1) return false;
  const loadedAt = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.name;
  if (loadedAt && loadedAt !== window.location.href) return true;
  return document.referrer.startsWith(window.location.origin);
}

/**
 * Back navigation: returns to the exact previous page (filters + scroll intact) when we
 * arrived from within the app, otherwise falls back to the section root.
 * `className` adjusts size, e.g. a 44px target in a phone header. Inside a
 * LeaveGuard it asks first while something holds the page (photos still
 * uploading on the contractor's job).
 */
export function BackLink({ fallback, label, className }: { fallback: string; label: string; className?: string }) {
  const router = useRouter();
  const guard = useLeaveGuard();

  function goBack() {
    if (cameFromApp()) router.back();
    else router.push(fallback);
  }

  return (
    <button
      onClick={() => guard(goBack)}
      className={cn("inline-flex items-center gap-1 text-xs text-muted hover:text-foreground hover:underline", className)}
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
