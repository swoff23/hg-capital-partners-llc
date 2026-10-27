"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, Pin, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { focusHeadingAfter, isSheetPath } from "@/lib/sheet-routes";
import { SIDEBAR_COOKIE, railState } from "@/lib/sidebar";
import type { ListHrefs } from "@/lib/list-memory";
import { AccountMenu, AppearanceRow } from "@/components/account-menu";
import { CommandPalette } from "@/components/command-palette";
import { LeaveLink } from "@/components/leave-link";
import { ListMemoryProvider } from "@/components/list-memory";
import { Monogram } from "@/components/monogram";
import { SideNav } from "@/components/nav";
import { chromeIconClass } from "@/components/ui";
import { ToastProvider } from "@/components/toast";

/** The shell's icon buttons: 32px with a mouse, 44px on touch; idle --fg-3, --fg-1 on hover. */
const chromeButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-1 hover:text-fg-1 pointer-coarse:size-11";

export function AppShell({
  children,
  userName,
  userEmail,
  initialPinned,
  listHrefs,
  signOutAction,
}: {
  children: ReactNode;
  /** The signed-in person's name, or null when they have none. */
  userName: string | null;
  userEmail: string;
  initialPinned: boolean;
  /** Each list's href with the query it was left in (lib/list-memory.ts), so the sidebar's links are right on first paint. */
  listHrefs: ListHrefs;
  signOutAction: () => Promise<void> | void;
}) {
  const [pinned, setPinned] = useState(initialPinned);
  const [hovered, setHovered] = useState(false);
  // Keyboard focus inside the rail opens it as a hover does (lib/sidebar.ts), so a Tab never lands on a hidden button.
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { expanded, floating } = railState({ pinned, hovered, keyboardFocus });
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  // Search opens over the page, so the phone drawer goes first.
  const closeDrawer = useCallback(() => setMobileOpen(false), []);

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
    // One Esc closes one layer: a toast (or any layer on top) that took the key has already called preventDefault.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  // After a route change focus goes to the new page's h1 (or the main area when it has none), so a
  // keyboard or screen reader user starts at the top of the page and not back at the sidebar.
  // The first render keeps the browser's own start; a filter that only changes the query isn't a new page.
  // A create sheet opening over a page, and closing back onto it, is not a new page: the sheet takes
  // focus and gives it back to what opened it (lib/sheet-routes.ts).
  const lastPath = useRef(pathname);
  const sheetOpenedOver = useRef<string | null>(null);
  useEffect(() => {
    const from = lastPath.current;
    if (from === pathname) return;
    lastPath.current = pathname;
    if (isSheetPath(pathname)) sheetOpenedOver.current = from;
    if (!focusHeadingAfter(from, pathname, sheetOpenedOver.current)) return;
    // A page that puts focus in a field itself (New task's autofocus title) keeps it.
    const here = document.activeElement;
    if (here instanceof HTMLElement && mainRef.current?.contains(here) && here.matches("input, textarea, select, [contenteditable]")) {
      return;
    }
    const target = mainRef.current?.querySelector("h1") ?? mainRef.current;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    // A heading takes focus for the reader, not to be drawn on.
    target.style.outline = "none";
    target.focus({ preventScroll: true });
  }, [pathname]);

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
      {/* The first Tab stop: past the search and the seven sections to the page. Parked above the screen until it has focus (not sr-only, so it keeps its full size and a touch screen's 44px). */}
      <a
        href="#main"
        // Safari's default Tab skips a plain link.
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        // Centered on the bar once shown: 52px below lg, 56px from lg, 36px tall (44px on touch).
        className="fixed -top-14 left-4 z-60 inline-flex h-9 items-center rounded-md border border-line-float bg-raised px-3 text-label text-fg-1 focus:top-2 focus:shadow-float pointer-coarse:h-11 pointer-coarse:focus:top-1 lg:focus:top-2.5 lg:pointer-coarse:focus:top-1.5"
      >
        Skip to content
      </a>
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
        <LeaveLink
          href="/"
          className="flex shrink-0 items-center gap-2 text-label font-semibold text-fg-1 pointer-coarse:min-h-11"
        >
          <Monogram size={24} />
          <span className="max-sm:sr-only">{BRAND.app}</span>
        </LeaveLink>
        <div className="min-w-0 max-w-md flex-1">
          <CommandPalette suspended={mobileOpen} onBeforeOpen={closeDrawer} />
        </div>
        {/* The account menu: from lg, where it carries the Theme; below, the drawer has Appearance and the account row. */}
        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <AccountMenu name={userName} email={userEmail} signOutAction={signOutAction} />
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
        // Only focus a keyboard put there (:focus-visible): a clicked link or Pin keeps none, so the rail
        // still closes when the pointer leaves.
        onFocus={(e) => setKeyboardFocus(e.target.matches(":focus-visible"))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setKeyboardFocus(false);
        }}
        className={cn(
          // Below lg the drawer scrolls, so a phone held sideways still reaches
          // every item and the footer. Across it stays clipped, which is how
          // the collapsed rail hides its labels.
          "fixed bottom-0 left-0 top-(--app-bar-h) z-40 flex flex-col overflow-hidden border-r border-line bg-canvas p-2 max-lg:overflow-y-auto max-lg:overscroll-contain",
          "w-64 transition-transform duration-sheet ease-spring lg:transition-[width]",
          // The phone drawer is the Overlay level; the rail, opened by hover over the page, floats.
          mobileOpen ? "translate-x-0 shadow-overlay" : "-translate-x-full lg:translate-x-0",
          expanded ? "lg:w-60" : "lg:w-16",
          floating && "lg:shadow-float",
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
          <AppearanceRow className="lg:hidden" />
          <AccountMenu variant="sidebar" name={userName} email={userEmail} signOutAction={signOutAction} />
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
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-h-[calc(100vh-var(--app-bar-h))] p-4 outline-none md:p-6 lg:p-8"
        >
          <div className="max-w-400">{children}</div>
        </main>
      </div>
    </div>
  );

  // One toast region for the app (components/toast.tsx); the portal mounts its own.
  return (
    <ToastProvider>
      <ListMemoryProvider initial={listHrefs}>{shell}</ListMemoryProvider>
    </ToastProvider>
  );
}
