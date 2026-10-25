import { requireUser } from "@/lib/auth";
import { TopTabs } from "@/components/nav";
import { PageHeader } from "@/components/ui";

export default async function FinancialsLayout({ children }: LayoutProps<"/financials">) {
  await requireUser();
  return (
    <div>
      {/* One line on a phone; QuickBooks stays the system of record. */}
      <PageHeader title="Financials" subtitle="Read-only from QuickBooks." />
      <TopTabs
        base="/financials"
        keep={["basis"]}
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
