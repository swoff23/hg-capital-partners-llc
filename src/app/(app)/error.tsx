"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Code } from "@/components/code";
import { isOfflineError } from "@/lib/action-result";
import { watchServerActions, writeFailedRecently } from "@/lib/failed-writes";

// Error boundaries load with the page, so the watch is on before anything can fail.
watchServerActions();

/** What the boundary knows about why it opened. A plain function, so reading the clock stays out of render. */
function causeOf(error: Error): "offline" | "save" | "unknown" {
  if (isOfflineError(error)) return "offline";
  return writeFailedRecently() ? "save" : "unknown";
}

/**
 * Error boundary for every signed-in page. Uncaught exceptions from a page or
 * a fire-and-forget server action land here instead of Next's blank
 * "Application error" screen. `retry` re-renders the segment.
 *
 * A plain sentence and one action, flat on the page (docs/brand-guidelines.md,
 * section 9, Empty and payoff states). The title says what's known: "That
 * didn't save" when a save failed in the last few seconds (lib/failed-writes)
 * or the device is offline; the generic title otherwise, including a page
 * that failed to render after a save that worked. The digest matches the
 * server log, so it stays, quietly, for whoever looks into it.
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

  // Read once, when the boundary opens, so the words don't change under the reader.
  const [cause] = useState(() => causeOf(error));

  return (
    <div className="max-w-prose py-8">
      <h1 className="text-title text-balance text-fg-1">{cause === "unknown" ? "Something went wrong" : "That didn't save"}</h1>
      <p className="mt-1 text-pretty text-body text-fg-2">
        {cause === "offline"
          ? "No connection, so the last action didn't go through. Your other changes are safe."
          : cause === "save"
            ? "The last action didn't complete, and your other changes are safe."
            : "Your saved changes are safe."}
      </p>
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
