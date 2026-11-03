"use client";
import { ErrorScreen } from "@/components/error-screen";

/**
 * Error boundary for the contractor portal's pages (My jobs and a job; the
 * first-password page keeps its own, welcome/error.tsx): the app's error
 * screen (components/error-screen.tsx) on the portal's page gutters, as the
 * job page's not-found sits on them. Without it a page that threw (a viewer
 * whose code didn't load, say) fell through to Next's blank error screen.
 */
export default function PortalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-400 px-4 sm:px-6 lg:px-8">
      <ErrorScreen {...props} />
    </main>
  );
}
