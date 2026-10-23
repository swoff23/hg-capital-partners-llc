import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "My Jobs | HG Capital Partners", template: "%s | HG Capital Partners" },
  robots: { index: false, follow: false },
};

/**
 * The contractor portal (docs/asana-migration-plan.md §5.1). Deliberately no
 * auth here: every page calls requirePortalPrincipal() itself, because a
 * layout doesn't re-run on client navigation and isn't a security boundary.
 * Code under (portal) never imports staff auth or the properties, deals or
 * QuickBooks modules (src/lib/auth-guard.test.ts).
 */
export default function PortalLayout({ children }: LayoutProps<"/p">) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
