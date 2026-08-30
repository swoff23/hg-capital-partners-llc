"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { SideNav } from "@/components/nav";

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

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground lg:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight">
          HG Capital OS
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
          className="fixed inset-0 top-14 z-30 bg-black/40 lg:hidden"
        />
      )}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed bottom-0 left-0 top-14 z-40 flex flex-col overflow-hidden border-r border-border bg-surface p-2",
          "w-64 transition-transform duration-200 ease-out lg:transition-[width]",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0",
          expanded ? "lg:w-60" : "lg:w-16",
          hovered && !pinned && "lg:shadow-2xl",
        )}
      >
        <div className="mb-1 flex h-7 items-center justify-end">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            className={cn(
              "hidden h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground lg:flex",
              !expanded && "pointer-events-none opacity-0",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill={pinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 17v5" />
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
            </svg>
          </button>
        </div>

        <SideNav collapsed={!expanded && !mobileOpen} onNavigate={() => setMobileOpen(false)} />

        <div className="mt-auto border-t border-border pt-2">
          <div className="flex items-center justify-between px-2 py-1.5 lg:hidden">
            <span className="text-xs font-medium text-muted">Appearance</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span
              title={userLabel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary"
            >
              {initials(userLabel)}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
              <div className="truncate text-xs font-medium">{userLabel}</div>
              <form action={signOutAction}>
                <button className="text-xs text-muted hover:text-foreground" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "pt-14 transition-[padding] duration-200 ease-out",
          pinned ? "lg:pl-60" : "lg:pl-16",
        )}
      >
        <main className="min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
