"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/deals", label: "Acquisitions" },
  { href: "/properties", label: "Portfolio" },
  { href: "/tasks", label: "Tasks" },
  { href: "/contractors", label: "Vendors" },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-accent text-primary" : "text-foreground hover:bg-background",
            )}
          >
            {l.label}
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
