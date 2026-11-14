"use client";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  ChartColumn,
  House,
  Settings2,
  SquareCheckBig,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { LeaveLink } from "@/components/leave-link";
import { useListHrefs } from "@/components/list-memory";
import { TOUCH_HEIGHT, chromeIconClass } from "@/components/ui";
import type { ListKey } from "@/lib/list-memory";
import { cn } from "@/lib/utils";

/** `list` marks the sections that remember their filters: the link carries the query the list was left in. */
const LINKS: { href: string; label: string; icon: LucideIcon; list?: ListKey }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/deals", label: "Deals", icon: TrendingUp, list: "deals" },
  { href: "/properties", label: "Portfolio", icon: Building2, list: "properties" },
  { href: "/tenants", label: "Tenants", icon: Users, list: "tenants" },
  { href: "/financials", label: "Financials", icon: ChartColumn },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig, list: "tasks" },
  { href: "/contractors", label: "Contractors", icon: Wrench, list: "contractors" },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

/**
 * The app's sections, in the sidebar and the phone drawer. Items are 32px
 * with a mouse and 44px on touch. Idle: label --fg-2, icon --muted-foreground, --muted
 * on hover. The current item is --accent with label and icon in --foreground, and
 * the 2px by 16px --primary notch at its left edge is its 3:1 mark, since the
 * fill alone is about 1.2:1 (section 9). The lists link to where they were
 * left (their last filters and sort), read from the layout's cookies and kept
 * current as a filter bar changes (components/list-memory.tsx).
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
  const remembered = useListHrefs();
  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5">
      {LINKS.map(({ href, label, icon: Icon, list }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <LeaveLink
            key={href}
            href={list ? remembered[list] : href}
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
                ? "bg-accent text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:bg-primary"
                : cn(
                    "text-fg-2 hover:bg-muted hover:text-foreground",
                    // Tapped before its page was prefetched: the current look at once (LeaveLink's data-pending).
                    "data-pending:bg-accent data-pending:text-foreground data-pending:before:absolute data-pending:before:left-0 data-pending:before:top-1/2 data-pending:before:h-4 data-pending:before:w-0.5 data-pending:before:-translate-y-1/2 data-pending:before:bg-primary",
                  ),
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(chromeIconClass, active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground group-data-pending:text-foreground")}
            />
            <span className="truncate">{label}</span>
          </LeaveLink>
        );
      })}
    </nav>
  );
}

/**
 * Page sections that are separate routes (CLAUDE.md, One switch per job):
 * underline tabs over a --border divider (docs/brand-guidelines.md, section 9).
 * Idle --fg-2, selected --foreground with the 2px --primary underline, one weight for
 * both. They are links in a labeled `<nav>`: the page you're on carries
 * `aria-current="page"` and the styles read it, so a screen reader hears
 * "current page" rather than a tab choice (selectors question 8). 44px on
 * touch. `label` names the nav ("Financials sections"); `keep` names query
 * params that hold across the tabs (Financials' ?basis=).
 */
export function TopTabs({
  tabs,
  base,
  label,
  keep = [],
}: {
  tabs: { href: string; label: string }[];
  base: string;
  label: string;
  keep?: string[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const carried = new URLSearchParams();
  for (const key of keep) {
    const value = params.get(key);
    if (value) carried.set(key, value);
  }
  const query = carried.toString();
  return (
    <nav aria-label={label} className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const path = `${base}${t.href}`;
        const href = query ? `${path}?${query}` : path;
        const active = pathname === path || (t.href === "" && pathname === base);
        return (
          <LeaveLink
            key={t.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 8px sides below sm, so Settings' three tabs keep one line at 320. A fixed
              // 14 / 20 at every size: text-label grows to 16 on touch (section 9).
              // eslint-disable-next-line hg/design-tokens -- the tab size is fixed
              "-mb-px flex items-center whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-sm font-medium text-fg-2 transition-colors hover:text-foreground sm:px-3",
              "aria-[current=page]:border-primary aria-[current=page]:text-foreground",
              // Tapped before its page was prefetched: the picked look at once (LeaveLink's data-pending).
              "data-pending:border-primary data-pending:text-foreground",
              TOUCH_HEIGHT,
            )}
          >
            {t.label}
          </LeaveLink>
        );
      })}
    </nav>
  );
}
