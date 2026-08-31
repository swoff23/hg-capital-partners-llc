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
  return (
    <div className="space-y-4">
      <TopTabs
        base="/settings"
        tabs={[
          { href: "", label: "CapEx rules" },
          { href: "/move-in-form", label: "Move-in form" },
        ]}
      />
      {children}
    </div>
  );
}
