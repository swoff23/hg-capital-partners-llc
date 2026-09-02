"use client";
import { useEffect } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";

/**
 * Error boundary for every signed-in page. Uncaught exceptions from a page or
 * a fire-and-forget server action land here instead of Next's blank
 * "Application error" screen. `retry` re-renders the segment.
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
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p className="text-muted">
            The last action didn&apos;t complete. Your other changes are safe; try again, and if it
            keeps failing, reload the page.
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted">ref {error.digest}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => retry()}>
              Try again
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
