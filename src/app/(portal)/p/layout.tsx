import type { Metadata } from "next";
import { LeaveGuard } from "@/components/leave-guard";
import { ToastProvider } from "@/components/toast";
import { UploadQueueProvider } from "@/components/upload-queue";
import { portalScope } from "@/lib/attachments/queue-owner";
import { BRAND } from "@/lib/brand";
import { requirePortalSession } from "@/lib/portal/session";

export const metadata: Metadata = {
  // absolute, so the app's "%s · HG" template (src/app/layout.tsx) leaves the portal's titles as they are.
  title: { absolute: `My Jobs | ${BRAND.company}`, template: `%s | ${BRAND.company}` },
  robots: { index: false, follow: false },
};

/**
 * The contractor portal (docs/asana-migration-plan.md §5.1). The layout
 * answers a first load before anything streams (requirePortalSession): a 404
 * while the portal is off and /login when signed out, not a 200 with a
 * page's loading skeleton. It isn't the security boundary: a layout doesn't
 * re-run on client navigation, so every page and action still calls
 * requirePortalPrincipal() itself, which also sends a starting password to
 * the first-password page.
 * Code under (portal) never imports staff auth or the properties, deals or
 * QuickBooks modules (src/lib/auth-guard.test.ts). The portal has its own
 * toast region (AppShell holds the app's). The work surface is --surface;
 * each page's header is the --canvas chrome, as in the app.
 *
 * One LeaveGuard for every portal page: the job page's photos still going up
 * hold "My jobs" and "Back to my jobs", and Sign out asks while the upload
 * queue holds it. The queue (UploadQueueProvider) sits under the guard and
 * the toasts, so uploads outlive the page that started them
 * (docs/specs/uploads-photos.md 2.1).
 *
 * The queue is each contractor's own (`portal:<contact id>`), as the app's is
 * each partner's: two contractors who sign in on one phone, or share a job,
 * never pick up each other's leftover files, so a file is only ever recorded
 * and posted as the person who picked it. The key gives each person a fresh
 * queue. A second tab that keeps showing someone else's queue
 * after another person signs in is stopped on the server: the queue names its
 * owner with every token, record, post and Undo, and a mismatch is refused
 * (attachments/queue-owner.ts), so its files wait in the outbox for their own
 * person.
 */
export default async function PortalLayout({ children }: LayoutProps<"/p">) {
  const principal = await requirePortalSession();
  const scope = portalScope(principal.contactId);
  return (
    <div className="min-h-screen bg-surface text-fg-1">
      <ToastProvider>
        <LeaveGuard>
          <UploadQueueProvider key={scope} scope={scope}>
            {children}
          </UploadQueueProvider>
        </LeaveGuard>
      </ToastProvider>
    </div>
  );
}
