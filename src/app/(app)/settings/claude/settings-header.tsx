"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopTabs } from "@/components/nav";
import { PageHeader } from "@/components/ui";

/**
 * The Settings page's frame. Capped at 1200 (docs/brand-guidelines.md, section 5, records): its rows pair a label
 * with a control at the far edge, which drift apart at 1600. The approval screen is one card on its own, so the
 * heading, the tabs and the cap step aside for it and the card centers in the app's content column, as wide as any page.
 */
export function SettingsFrame({ tabs, children }: { tabs: { href: string; label: string }[]; children: ReactNode }) {
  if (usePathname() === "/settings/claude/approve") return <div className="pt-6">{children}</div>;
  return (
    <div className="max-w-300">
      <PageHeader title="Settings" />
      <TopTabs base="/settings" label="Settings sections" tabs={tabs} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
