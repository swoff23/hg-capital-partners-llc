"use client";
import { Moon, Sun } from "lucide-react";

/** Sets [data-theme] on <html> before paint to avoid a flash. Inlined in <head>. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('hgos-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export function ThemeToggle() {
  function toggle() {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("hgos-theme", next);
    } catch {}
  }

  // A secondary icon button: idle icon --fg-3, --fg-1 on hover.
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-surface text-fg-3 transition-colors hover:bg-fill-1 hover:text-fg-1"
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden="true" />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden="true" />
    </button>
  );
}
