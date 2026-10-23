"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { TOUCH_HEIGHT } from "@/components/ui";
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
 * A chrome icon (nav items, the shell's buttons): 16px at a 1.5 stroke with
 * a mouse, 20px at 1.75 on touch (docs/brand-guidelines.md, section 6).
 */
export const chromeIconClass = "size-4 shrink-0 stroke-[1.5] pointer-coarse:size-5 pointer-coarse:stroke-[1.75]";

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

export function TopTabs({ tabs, base }: { tabs: { href: string; label: string }[]; base: string }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = pathname === href || (t.href === "" && pathname === base);
        return (
          <Link
            key={t.href}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
