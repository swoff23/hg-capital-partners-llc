"use client";
import { ErrorScreen } from "@/components/error-screen";

/**
 * Error boundary for every signed-in page: the error screen
 * (components/error-screen.tsx), which says what's known and offers Try again,
 * or Reload when it was a chunk of the page's code that didn't load. `retry`
 * re-renders the segment.
 */
export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
