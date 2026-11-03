import { TopTabs } from "@/components/nav";
import { PageHeader } from "@/components/ui";

/**
 * One "Settings" h1 above the tabs, as on Financials. The tabs name what each
 * one holds, so there's no subtitle; a tab's own actions (Reset to defaults,
 * Save) sit at the top of its content. No session check here: each tab's
 * page checks it, so a tab's prefetched loading screen costs no query
 * (docs/specs/performance.md 4.1).
 */
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  // Capped at 1200 (docs/brand-guidelines.md, section 5, records): its rows
  // pair a label with a control at the far edge, which drift apart at 1600.
  return (
    <div className="max-w-300">
      <PageHeader title="Settings" />
      <TopTabs
        base="/settings"
        label="Settings sections"
        tabs={[
          { href: "", label: "CapEx rules" },
          { href: "/move-in-form", label: "Move-in form" },
          { href: "/storage", label: "Storage" },
        ]}
      />
      <div className="pt-6">{children}</div>
    </div>
  );
}
