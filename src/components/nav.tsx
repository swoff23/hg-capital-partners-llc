"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  ChartColumn,
  House,
  Settings2,
  SquareCheckBig,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { TOUCH_HEIGHT, chromeIconClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/deals", label: "Deals", icon: TrendingUp },
  { href: "/properties", label: "Portfolio", icon: Building2 },
  { href: "/financials", label: "Financials", icon: ChartColumn },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
  { href: "/contractors", label: "Contractors", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

/**
 * The app's sections, in the sidebar and the phone drawer. Items are 32px
 * with a mouse and 44px on touch. Idle: label --fg-2, icon --fg-3, --fill-1
 * on hover. The current item is --fill-2 with label and icon in --fg-1, and
 * the 2px by 16px --act notch at its left edge is its 3:1 mark, since the
 * fill alone is about 1.2:1 (section 9).
 */
export function SideNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Fired when a link is clicked: closes the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 16px in from the item's edge with a mouse (14 on touch), so the
              // icon sits centered in the collapsed rail.
              "group relative flex h-8 items-center gap-3 rounded-md px-4 text-label transition-colors pointer-coarse:px-3.5",
              TOUCH_HEIGHT,
              active
                ? "bg-fill-2 text-fg-1 before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:bg-act"
                : "text-fg-2 hover:bg-fill-1 hover:text-fg-1",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(chromeIconClass, active ? "text-fg-1" : "text-fg-3 group-hover:text-fg-1")}
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Page sections that are separate routes (CLAUDE.md, One switch per job):
 * underline tabs over a --line divider (docs/brand-guidelines.md, section 9).
 * Idle --fg-2, selected --fg-1 with the 2px --act underline, one weight for
 * both; the state is `aria-selected` and the styles read it. 44px on touch.
 * `keep` names query params that hold across the tabs (Financials' ?basis=).
 */
export function TopTabs({ tabs, base, keep = [] }: { tabs: { href: string; label: string }[]; base: string; keep?: string[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const carried = new URLSearchParams();
  for (const key of keep) {
    const value = params.get(key);
    if (value) carried.set(key, value);
  }
  const query = carried.toString();
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const path = `${base}${t.href}`;
        const href = query ? `${path}?${query}` : path;
        const active = pathname === path || (t.href === "" && pathname === base);
        return (
          <Link
            key={t.href}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              // 8px sides below sm, so Settings' three tabs keep one line at 320.
              "-mb-px flex items-center whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-sm font-medium text-fg-2 transition-colors hover:text-fg-1 sm:px-3",
              "aria-selected:border-act aria-selected:text-fg-1",
              TOUCH_HEIGHT,
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
