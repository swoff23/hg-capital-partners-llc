import { requireUser } from "@/lib/auth";
import { TopTabs } from "@/components/nav";

/**
 * No page title here — CapexRulesEditor already renders its own PageHeader
 * ("Settings" / "CapEx planning rules"); duplicating it at the layout level
 * would put two headings on screen. Each tab owns its own PageHeader instead
 * (see move-in-form/page.tsx), same title, different subtitle.
 */
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireUser();
  // Capped at 1200 (docs/brand-guidelines.md, section 5, records): its rows
  // pair a label with a control at the far edge, which drift apart at 1600.
  return (
    <div className="max-w-300 space-y-4">
      <TopTabs
        base="/settings"
        tabs={[
          { href: "", label: "CapEx rules" },
          { href: "/move-in-form", label: "Move-in form" },
          { href: "/storage", label: "Storage" },
        ]}
      />
      {children}
    </div>
  );
}
