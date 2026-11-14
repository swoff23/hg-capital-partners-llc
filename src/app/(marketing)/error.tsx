"use client";
import { useEffect } from "react";
import { publicContainer, publicCtaClass, publicType } from "@/components/public/ui";
import { reportClientError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";

/** Error boundary for the public pages, in the same dark material as the rest of the front door. */
export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Named "public" here: the address alone can't tell the public `/` from Home (lib/error-report.ts areaOfPath).
    reportClientError(error, "boundary", "public");
  }, [error]);

  return (
    <main className={cn(publicContainer, "flex flex-1 flex-col items-center justify-center py-16 text-center")}>
      {/* The public pages only read, so a failure here is always the page itself. */}
      <h1 className={cn(publicType.heading, "text-foreground")}>That page didn&rsquo;t load</h1>
      <p className={cn(publicType.lead, "mt-3 max-w-sm text-muted-foreground")}>Please try again in a moment.</p>
      <button type="button" onClick={() => retry()} className={cn(publicCtaClass, "mt-8")}>
        Try again
      </button>
    </main>
  );
}
