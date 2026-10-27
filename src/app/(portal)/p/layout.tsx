import type { Metadata } from "next";
import { LeaveGuard } from "@/components/leave-guard";
import { ToastProvider } from "@/components/toast";
import { UploadQueueProvider } from "@/components/upload-queue";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  // absolute, so the app's "%s · HG" template (src/app/layout.tsx) leaves the portal's titles as they are.
  title: { absolute: `My Jobs | ${BRAND.company}`, template: `%s | ${BRAND.company}` },
  robots: { index: false, follow: false },
};

/**
 * The contractor portal (docs/asana-migration-plan.md §5.1). Deliberately no
 * auth here: every page calls requirePortalPrincipal() itself, because a
 * layout doesn't re-run on client navigation and isn't a security boundary.
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
 */
export default function PortalLayout({ children }: LayoutProps<"/p">) {
  return (
    <div className="min-h-screen bg-surface text-fg-1">
      <ToastProvider>
        <LeaveGuard>
          <UploadQueueProvider scope="portal">{children}</UploadQueueProvider>
        </LeaveGuard>
      </ToastProvider>
    </div>
  );
}
