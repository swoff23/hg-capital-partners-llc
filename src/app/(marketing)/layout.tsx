import type { Viewport } from "next";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { brandTokensDark } from "@/lib/brand-tokens";

// The public site is always the dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

/**
 * Public-facing pages (landing, rentals, residents, and later the tenant
 * portal). Outside the (app) shell on purpose: no sidebar, no auth. The front
 * door looks the same for everyone, so it is the app's dark theme, fixed:
 * data-surface="public" takes the dark tokens whatever the theme toggle says
 * (docs/brand-guidelines.md, section 4). Overlays opened here portal to
 * <body>, outside this wrapper, so each puts data-surface="public" on its own
 * root (the header's phone menu does).
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-surface="public" className="flex min-h-screen flex-col bg-canvas text-fg-1">
      <PublicHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
    </div>
  );
}
