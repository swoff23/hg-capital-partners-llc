import { TopTabs } from "@/components/nav";
import { PageHeader } from "@/components/ui";

/**
 * No session check here: each tab's page checks it (a layout isn't a security
 * boundary and doesn't re-run on a tab switch), and a layout that reads the
 * session would make every prefetch of a tab's loading screen cost a query
 * and hold it back (docs/specs/performance.md 4.1).
 */
export default function FinancialsLayout({ children }: LayoutProps<"/financials">) {
  return (
    <div>
      {/* One line on a phone; QuickBooks stays the system of record. */}
      <PageHeader title="Financials" subtitle="Read-only from QuickBooks." />
      <TopTabs
        base="/financials"
        label="Financials sections"
        // The basis and the Overview's period follow you between the tabs.
        keep={["basis", "period"]}
        tabs={[
          { href: "", label: "Overview" },
          { href: "/rent-roll", label: "Rent roll" },
          { href: "/settings", label: "Settings" },
        ]}
      />
      <div className="pt-6">{children}</div>
    </div>
  );
}
