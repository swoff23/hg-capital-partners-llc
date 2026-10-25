"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { Code } from "@/components/code";

/**
 * Error boundary for every signed-in page. Uncaught exceptions from a page or
 * a fire-and-forget server action land here instead of Next's blank
 * "Application error" screen. `retry` re-renders the segment.
 *
 * A plain sentence and one action, flat on the page (docs/brand-guidelines.md,
 * section 9, Empty and payoff states). The digest matches the server log, so
 * it stays, quietly, for whoever looks into it.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-prose py-8">
      <h1 className="text-title text-balance text-fg-1">Something went wrong</h1>
      <p className="mt-1 text-pretty text-body text-fg-2">The last action didn&apos;t complete, and your other changes are safe.</p>
      <Button className="mt-4" onClick={() => retry()}>
        Try again
      </Button>
      {/* A code read character by character, so Code: one tap copies it for support. */}
      {error.digest && (
        <p className="mt-6 text-meta text-fg-3">
          Ref <Code value={error.digest} label="Error reference" />
        </p>
      )}
    </div>
  );
}
