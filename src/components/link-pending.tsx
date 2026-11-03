"use client";
import { useLinkStatus } from "next/link";

/**
 * Put inside a Next `Link`: while that link's page is on the way and its
 * prefetch hadn't landed (a phone that just opened the app), it marks the
 * link with a hidden `data-link-pending` element, and the row styles itself
 * from it with `pendingRowFill` (components/ui.tsx): its hover fill.
 * Prefetched links never go pending (useLinkStatus), so a fast tap shows
 * nothing extra. No spinner (docs/specs/performance.md 4.6).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span data-link-pending="" hidden /> : null;
}
