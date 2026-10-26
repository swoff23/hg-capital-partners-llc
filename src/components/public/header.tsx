"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu as MenuIcon } from "lucide-react";
import { Button as AriaButton, Menu as AriaMenu, RouterProvider } from "react-aria-components";
import { MenuItem, MenuTrigger } from "@/components/menu";
import { PopoverSurface } from "@/components/popover";
import { buttonClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { publicContainer, publicLinkHover, publicType } from "./ui";

/**
 * Top nav for every public page (PRD §3: "Primary navigation: Rentals |
 * Residents | HG Login"), 64px over a --line rule (docs/brand-guidelines.md,
 * section 10). Plain text links, not pills or buttons: HG Login stays the
 * quietest link on the page, in --pub-faint; it's a door for two people, not
 * a call to action. Below 600px the links fold into a 44px menu button.
 */
const LINKS = [
  { href: "/rentals", label: "Rentals" },
  { href: "/residents", label: "Residents" },
  { href: "/login", label: "HG Login" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader() {
  const pathname = usePathname() ?? "";

  return (
    <header className="border-b border-line">
      <div className={cn(publicContainer, "flex h-16 items-center justify-between gap-4")}>
        <Link
          href="/"
          className={cn(publicType.wordmark, "inline-flex items-center text-fg-1 pointer-coarse:min-h-11", publicLinkHover)}
        >
          {BRAND.company}
        </Link>

        <nav aria-label="Public site" className={cn(publicType.meta, "hidden items-center gap-7 min-[37.5rem]:flex")}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(pathname, l.href) ? "page" : undefined}
              className={cn(
                "inline-flex items-center whitespace-nowrap pointer-coarse:min-h-11 aria-[current=page]:text-fg-1",
                l.href === "/login" ? "text-pub-faint" : "text-fg-3",
                publicLinkHover,
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <PhoneMenu pathname={pathname} />
      </div>
    </header>
  );
}

/**
 * The links below 600px. React Aria portals the menu to <body>, outside the
 * page's public wrapper, so its own root carries data-surface="public" to
 * stay in the dark material. The RouterProvider makes its items client-side
 * links, like the header's.
 */
function PhoneMenu({ pathname }: { pathname: string }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={(href) => router.push(href)}>
      <MenuTrigger>
        <AriaButton
          aria-label="Menu"
          className={cn(buttonClass({ variant: "ghost", icon: true }), "-mr-3 h-11 w-11 text-fg-1 min-[37.5rem]:hidden")}
        >
          <MenuIcon aria-hidden="true" className="size-4 shrink-0 stroke-[1.5] pointer-coarse:size-5 pointer-coarse:stroke-[1.75]" />
        </AriaButton>
        {/* containerPadding: its right edge lands on the 16px page gutter, not React Aria's 12. */}
        <PopoverSurface placement="bottom end" containerPadding={16} data-surface="public" className="min-w-44">
          <AriaMenu aria-label="Public site" className="p-1 outline-none">
            {LINKS.map((l) => (
              <MenuItem key={l.href} id={l.href} href={l.href} current={isCurrent(pathname, l.href)}>
                {l.label}
              </MenuItem>
            ))}
          </AriaMenu>
        </PopoverSurface>
      </MenuTrigger>
    </RouterProvider>
  );
}
