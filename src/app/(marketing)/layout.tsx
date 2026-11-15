import type { Viewport } from "next";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { PublicSurface } from "@/components/public/surface";
import { brandTokensDark } from "@/lib/brand-tokens";

// The public site is always the dark material, so the browser's bar is too.
export const viewport: Viewport = { themeColor: brandTokensDark.canvas };

/**
 * Public-facing pages (landing, rentals, residents, and later the tenant
 * portal). Outside the (app) shell on purpose: no sidebar, no auth. The front
 * door looks the same for everyone, so it is the app's dark theme, fixed:
 * PublicSurface's data-surface="public" takes the dark tokens whatever the
 * theme toggle says (docs/brand-guidelines.md, section 4), and React Aria
 * overlays opened here portal into it rather than <body>. HG's own overlays
 * still put data-surface="public" on their root too (the header's phone menu
 * does) until they go stock.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <PublicSurface>
      <PublicHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
    </PublicSurface>
  );
}
