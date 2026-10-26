"use client";
import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Sets [data-theme] on <html> before paint to avoid a flash. Inlined in <head>.
 *
 * The theme is the person's pick when they made one (localStorage `hgos-theme`
 * holds "light" or "dark") and the device's otherwise, which is the "System"
 * choice in the account menu: with no pick stored, the script follows the OS
 * and keeps following it when it flips.
 *
 * It also keeps the browser's bar on the app's theme rather than the OS's.
 * The root layout's viewport emits two theme-color metas, one per
 * prefers-color-scheme (--canvas light and dark). Whenever data-theme changes
 * (here, or from setThemePref), the meta for the app's theme gets media "all"
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
export const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var q=matchMedia('(prefers-color-scheme: dark)');var pick=function(){var t=null;try{t=localStorage.getItem('hgos-theme')}catch(e){}return t==='light'||t==='dark'?t:(q.matches?'dark':'light')};d.setAttribute('data-theme',pick());var follow=function(){var t=null;try{t=localStorage.getItem('hgos-theme')}catch(e){}if(t!=='light'&&t!=='dark')d.setAttribute('data-theme',pick())};if(q.addEventListener)q.addEventListener('change',follow);else if(q.addListener)q.addListener(follow);}catch(e){}try{var sync=function(){var dark=d.getAttribute('data-theme')==='dark'||!!document.querySelector('[data-surface="public"]'),m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){var s=m[i].getAttribute('data-scheme');if(!s){var q=m[i].getAttribute('media')||'';s=q.indexOf('prefers-color-scheme: dark')>-1?'dark':q.indexOf('prefers-color-scheme: light')>-1?'light':'';if(!s)continue;m[i].setAttribute('data-scheme',s);}var want=(s==='dark')===dark?'all':'not all';if(m[i].getAttribute('media')!==want)m[i].setAttribute('media',want);}};sync();var o=new MutationObserver(sync);o.observe(d,{attributes:true,attributeFilter:['data-theme']});o.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['media']});document.addEventListener('DOMContentLoaded',sync);}catch(e){}})();`;

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

/* ---------------- The person's pick ---------------- */

/** System follows the device; Light and Dark are the person's own. */
export type ThemePref = "system" | "light" | "dark";

export const THEME_PREFS: readonly { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

const STORAGE_KEY = "hgos-theme";
const CHANGED = "hgos-theme-change";

/** The pick in this tab alone, when the browser won't let localStorage hold it (a private window). */
let held: ThemePref | null = null;

function readPref(): ThemePref {
  if (held) return held;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Sets [data-theme] for a pick, "system" meaning the device's. Setting it is
 * enough: THEME_SCRIPT's observer moves the browser's bar with it.
 */
function applyPref(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function subscribe(onChange: () => void) {
  // A pick made in another tab (a null key is its storage being cleared): this page takes the
  // theme too, not only the menu's tick, since the other tab's setThemePref ran there.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    applyPref(readPref());
    onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Makes a pick: stored (System removes the key, so the device decides) and
 * applied at once.
 */
export function setThemePref(pref: ThemePref) {
  held = null;
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    held = pref;
  }
  applyPref(pref);
  window.dispatchEvent(new Event(CHANGED));
}

/** The pick, and a way to change it. "System" until the page has hydrated, so server and browser agree. */
export function useThemePref(): readonly [ThemePref, (pref: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as const);
  return [pref, setThemePref] as const;
}
