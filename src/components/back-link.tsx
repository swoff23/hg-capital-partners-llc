"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
 * A standalone link known by its place above the title: text-meta 500 in
 * --fg-2, underlined on hover, 44px tall on touch (docs/brand-guidelines.md,
 * section 9). `className` adjusts it, e.g. the portal header's. Inside a
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
      type="button"
      onClick={() => guard(goBack)}
      className={cn(
        "inline-flex items-center gap-1 text-meta font-medium text-fg-2 hover:text-fg-1 hover:underline pointer-coarse:min-h-11 print:hidden",
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
