"use client";
import { useRouter } from "next/navigation";

/**
 * Back navigation: returns to the exact previous page (filters + scroll intact) when we
 * arrived from within the app, otherwise falls back to the section root.
 */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();

  function goBack() {
    const cameFromApp =
      document.referrer.startsWith(window.location.origin) && window.history.length > 1;
    if (cameFromApp) router.back();
    else router.push(fallback);
  }

  return (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground hover:underline"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
