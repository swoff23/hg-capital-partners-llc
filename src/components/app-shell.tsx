"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, Pin, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Avatar } from "@/components/avatar";
import { GlobalSearch } from "@/components/global-search";
import { Monogram } from "@/components/monogram";
import { ThemeToggle } from "@/components/theme-toggle";
import { SideNav } from "@/components/nav";
import { chromeIconClass } from "@/components/ui";
import { ToastProvider } from "@/components/toast";

/** The shell's icon buttons: 32px with a mouse, 44px on touch; idle --fg-3, --fg-1 on hover. */
const chromeButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-1 hover:text-fg-1 pointer-coarse:size-11";

export function AppShell({
  children,
  userLabel,
  initialPinned,
  signOutAction,
}: {
  children: ReactNode;
  userLabel: string;
  initialPinned: boolean;
  signOutAction: () => void;
}) {
  const [pinned, setPinned] = useState(initialPinned);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const expanded = pinned || hovered;

  function togglePin() {
    setPinned((prev) => {
      const next = !prev;
      try {
        document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      return next;
    });
  }

  // Mobile drawer: lock body scroll and close on Escape while it's open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  // Drop the drawer state once the viewport is back to desktop width.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const sync = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The chrome is --canvas: the sidebar, and below lg the 52px top bar. From
  // lg the header is the desktop one, 56px on --surface like the work area
  // (docs/brand-guidelines.md, section 9). --app-bar-h in globals.css holds
  // the bar's height at each size, so everything under it reads one value.
  const shell = (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 flex h-(--app-bar-h) items-center gap-3 border-b border-line bg-canvas px-4 lg:bg-surface lg:px-5">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          // Its icon centers on the drawer's icon column (x 32): the 32px button
          // starts at the 16px gutter, the 44px touch one 6px before it.
          className={cn(chromeButtonClass, "pointer-coarse:-ml-1.5 lg:hidden")}
        >
          <Menu aria-hidden="true" className={chromeIconClass} />
        </button>
        {/* The lockup: the tile and the app's name, which drops on phones.
            From lg the tile sits centered over the rail's icons. */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-label font-semibold text-fg-1 pointer-coarse:min-h-11"
        >
          <Monogram size={24} />
          <span className="max-sm:sr-only">{BRAND.app}</span>
        </Link>
        <div className="min-w-0 max-w-md flex-1">
          <GlobalSearch />
        </div>
        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 top-(--app-bar-h) z-30 bg-scrim lg:hidden"
        />
      )}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          // Below lg the drawer scrolls, so a phone held sideways still reaches
          // every item and the footer. Across it stays clipped, which is how
          // the collapsed rail hides its labels.
          "fixed bottom-0 left-0 top-(--app-bar-h) z-40 flex flex-col overflow-hidden border-r border-line bg-canvas p-2 max-lg:overflow-y-auto max-lg:overscroll-contain",
          "w-64 transition-transform duration-sheet ease-spring lg:transition-[width]",
          // The phone drawer is the Overlay level; the rail, opened by hover over the page, floats.
          mobileOpen ? "translate-x-0 shadow-overlay" : "-translate-x-full lg:translate-x-0",
          expanded ? "lg:w-60" : "lg:w-16",
          hovered && !pinned && "lg:shadow-float",
        )}
      >
        <div className="mb-1 flex min-h-7 items-center justify-end">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className={cn(chromeButtonClass, "size-7 lg:hidden")}
          >
            <X aria-hidden="true" className={chromeIconClass} />
          </button>
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            className={cn(
              chromeButtonClass,
              "hidden size-7 lg:flex",
              !expanded && "pointer-events-none opacity-0",
            )}
          >
            <Pin aria-hidden="true" fill={pinned ? "currentColor" : "none"} className={chromeIconClass} />
          </button>
        </div>

        <SideNav collapsed={!expanded && !mobileOpen} onNavigate={() => setMobileOpen(false)} />

        <div className="mt-auto border-t border-line pt-2">
          <div className="flex items-center justify-between px-2 py-1.5 lg:hidden pointer-coarse:py-0">
            <span className="text-meta font-medium text-fg-2">Appearance</span>
            <ThemeToggle />
          </div>
          {/* 10px in, so the 28px avatar centers on the rail's icons. */}
          <div title={userLabel} className="flex items-center gap-2 px-2.5 py-1.5">
            <Avatar name={userLabel} size={28} />
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
              <div className="truncate text-meta font-medium text-fg-1">{userLabel}</div>
              <form action={signOutAction}>
                {/* A 44px target on touch, like every control in the drawer. */}
                <button
                  className="flex w-fit items-center text-meta text-fg-3 transition-colors hover:text-fg-1 pointer-coarse:min-h-11"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "pt-(--app-bar-h) transition-[padding] duration-sheet ease-spring",
          pinned ? "lg:pl-60" : "lg:pl-16",
        )}
      >
        {/* Page gutters 16 / 24 / 32 (phone, tablet, desktop). Lists run full
            width to 1600, anchored to the sidebar; a record page sets its own
            1200 cap (docs/brand-guidelines.md, section 5). */}
        <main className="min-h-[calc(100vh-var(--app-bar-h))] p-4 md:p-6 lg:p-8">
          <div className="max-w-400">{children}</div>
        </main>
      </div>
    </div>
  );

  // One toast region for the app (components/toast.tsx); the portal mounts its own.
  return <ToastProvider>{shell}</ToastProvider>;
}
