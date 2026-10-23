import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";
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
 */
export default function PortalLayout({ children }: LayoutProps<"/p">) {
  return (
    <div className="min-h-screen bg-surface text-fg-1">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
