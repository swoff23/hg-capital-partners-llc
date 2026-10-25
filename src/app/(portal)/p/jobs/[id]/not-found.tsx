import RootNotFound from "@/app/not-found";
import { LinkButton } from "@/components/ui";
import { getEnv } from "@/lib/env";

/**
 * A job this contractor can't open: reassigned, closed before the portal's
 * history starts, or never theirs. Usually reached from an email's "Open
 * job" button, so it points back to My jobs in the portal's own look
 * (refs: Subway "Unable to load product", mobbin.com/screens/b8bbfbfb).
 * While PORTAL_ENABLED is off the portal shows nothing of itself, so this is
 * the site's plain 404.
 */
export default function JobNotFound() {
  if (!getEnv().portalEnabled) return <RootNotFound />;
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-title text-balance text-fg-1">This job isn&apos;t available</h1>
      <LinkButton href="/p" variant="primary" className="mt-5">
        Back to my jobs
      </LinkButton>
    </main>
  );
}
