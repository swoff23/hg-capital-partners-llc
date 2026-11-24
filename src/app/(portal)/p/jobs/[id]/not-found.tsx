import RootNotFound from "@/app/not-found";
import { LinkButton } from "@/components/ui";
import { getEnv } from "@/lib/env";
import { goneJobForSession } from "@/lib/portal/gone-job";
import { getPortalPrincipal } from "@/lib/portal/session";
import { GoneJobView } from "../../_components/gone-job";
import { NotWhenShared } from "../../_components/shared-link";

/**
 * A job this contractor can't open: reassigned, closed before the portal's
 * history starts, or never theirs. Usually reached from an email's "Open
 * job" button, so it points back to My jobs in the portal's own look
 * (refs: Subway "Unable to load product", mobbin.com/screens/b8bbfbfb).
 * While PORTAL_ENABLED is off the portal shows nothing of itself, so this is
 * the site's plain 404. Someone the job was shared with has no My jobs:
 * they get the verdict on the one job they hold (docs/specs/emails-redesign.md,
 * Q7), "This job is canceled. No need to go." or "Zack is no longer on this
 * job. No need to go.", with its title and street, or the plain heading
 * when neither fits. The contractor's own visit keeps the plain heading and
 * Back to my jobs.
 */
export default async function JobNotFound() {
  if (!getEnv().portalEnabled) return <RootNotFound />;
  const principal = await getPortalPrincipal();
  if (principal?.shared && principal.onlyTaskId) {
    const gone = await goneJobForSession(principal.onlyTaskId, principal.contactId);
    if (gone) return <GoneJobView job={gone} />;
  }
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-title text-balance text-foreground">This job isn&apos;t available</h1>
      <NotWhenShared>
        <LinkButton href="/p" variant="primary" className="mt-5">
          Back to my jobs
        </LinkButton>
      </NotWhenShared>
    </main>
  );
}
