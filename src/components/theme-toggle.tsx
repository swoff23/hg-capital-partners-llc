"use client";
import { useLayoutEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { chromeIconClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Sets [data-theme] on <html> before paint to avoid a flash. Inlined in <head>.
 *
 * It also keeps the browser's bar on the app's theme rather than the OS's.
 * The root layout's viewport emits two theme-color metas, one per
 * prefers-color-scheme (--canvas light and dark). Whenever data-theme changes
 * (here, or from ThemeToggle), the meta for the app's theme gets media "all"
 * and the other "not all", so the browser uses the app's canvas whatever the
 * OS says. Only the media changes, never the content, so React still
 * recognizes Next's metas when it hydrates and replaces them on navigation;
 * the observer picks up the ones it inserts. A page that sets one fixed
 * themeColor (public and sign-in pages, #0a0e17) emits a meta without media,
 * which this leaves alone. A page drawn on the public material without its
 * own themeColor (the root not-found page) counts as dark, so its bar is the
 * dark canvas too; the body isn't parsed when this first runs, so it syncs
 * again once the document is.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('hgos-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t);}catch(e){}try{var sync=function(){var dark=d.getAttribute('data-theme')==='dark'||!!document.querySelector('[data-surface="public"]'),m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){var s=m[i].getAttribute('data-scheme');if(!s){var q=m[i].getAttribute('media')||'';s=q.indexOf('prefers-color-scheme: dark')>-1?'dark':q.indexOf('prefers-color-scheme: light')>-1?'light':'';if(!s)continue;m[i].setAttribute('data-scheme',s);}var want=(s==='dark')===dark?'all':'not all';if(m[i].getAttribute('media')!==want)m[i].setAttribute('media',want);}};sync();var o=new MutationObserver(sync);o.observe(d,{attributes:true,attributeFilter:['data-theme']});o.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['media']});document.addEventListener('DOMContentLoaded',sync);}catch(e){}})();`;

/**
 * Runs THEME_SCRIPT once more on a page that arrived without it. When a page
 * calls notFound(), Next answers with its error shell (an empty <html> with
 * no <head> of ours) and draws the not-found page in the browser, where a
 * script React inserts never runs, so data-theme would stay unset and a dark
 * theme would land on a white page. A script element made here does run.
 * Mounted once, in the root layout.
 */
export function ThemeFallback() {
  useLayoutEffect(() => {
    if (document.documentElement.hasAttribute("data-theme")) return;
    const s = document.createElement("script");
    s.textContent = THEME_SCRIPT;
    document.head.appendChild(s);
    s.remove();
  }, []);
  return null;
}

export function ThemeToggle() {
  // Setting data-theme is enough: THEME_SCRIPT's observer moves the browser's bar with it.
  function toggle() {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("hgos-theme", next);
    } catch {}
  }

  // A secondary icon button: idle icon --fg-3, --fg-1 on hover. 32px with a mouse, 44px on touch.
  // Its icons are chrome icons, like the rail's: 16px at 1.5, 20px at 1.75 on touch.
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface text-fg-3 transition-colors hover:bg-fill-1 hover:text-fg-1 pointer-coarse:size-11"
    >
      <Sun className={cn(chromeIconClass, "hidden dark:block")} aria-hidden="true" />
      <Moon className={cn(chromeIconClass, "dark:hidden")} aria-hidden="true" />
    </button>
  );
}
