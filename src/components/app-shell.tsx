"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { SideNav } from "@/components/nav";

export function AppShell({
  children,
  userLabel,
  devAuth,
  initialPinned,
  signOutAction,
}: {
  children: ReactNode;
  userLabel: string;
  devAuth: boolean;
  initialPinned: boolean;
  signOutAction: () => void;
}) {
  const [pinned, setPinned] = useState(initialPinned);
  const [hovered, setHovered] = useState(false);
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

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight">
          HG Capital OS
        </Link>
        <div className="max-w-md flex-1">
          <GlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {devAuth && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              dev auth
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed bottom-0 left-0 top-14 z-40 hidden flex-col overflow-hidden border-r border-border bg-surface p-2 transition-[width] duration-200 ease-out md:flex",
          expanded ? "w-60" : "w-16",
          hovered && !pinned && "shadow-2xl",
        )}
      >
        <div className="mb-1 flex h-7 items-center">
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            className={cn(
              "ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground",
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

        <SideNav collapsed={!expanded} />

        <div className="mt-auto border-t border-border pt-2">
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
          pinned ? "md:pl-60" : "md:pl-16",
        )}
      >
        <main className="min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
