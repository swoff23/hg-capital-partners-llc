"use client";
import { ErrorScreen } from "@/components/error-screen";
import { JobHeader } from "./_components/job-header";

/**
 * Error boundary for a job's page: the job page's own header (My jobs at the top left, where it always is) over the
 * app's error screen, on the page's gutters. The shared boundary one level up replaces the whole page, and a
 * contractor who opened the job from an email has no history to go back to. My jobs keeps that shared boundary,
 * since a link to itself would clear nothing.
 */
export default function JobError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <JobHeader />
      <main className="mx-auto max-w-300 px-4 sm:px-6 lg:px-8">
        <ErrorScreen {...props} />
      </main>
    </>
  );
}
