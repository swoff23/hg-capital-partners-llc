import { requireUser } from "@/lib/auth";
import { TopTabs } from "@/components/nav";

export default async function FinancialsLayout({ children }: LayoutProps<"/financials">) {
  await requireUser();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Financials</h1>
        <p className="mt-0.5 text-sm text-muted">
          Read-only from QuickBooks. QuickBooks stays the system of record.
        </p>
      </div>
      <TopTabs
        base="/financials"
        tabs={[
          { href: "", label: "Overview" },
          { href: "/rent-roll", label: "Rent roll" },
          { href: "/settings", label: "Settings" },
        ]}
      />
      {children}
    </div>
  );
}
