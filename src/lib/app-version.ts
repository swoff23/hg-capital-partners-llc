/**
 * When a tab left open hears that a new version of the app is live, and what
 * it does about it (components/update-notice.tsx, docs/specs/update-notice.md).
 *
 * A version is the deploy's commit (VERCEL_GIT_COMMIT_SHA): the page knows the
 * one it loaded with from its layout, and asks /api/version for the live one.
 * Skew Protection keeps an old tab talking to its own deployment for up to 12
 * hours, so nothing breaks, but nothing tells the person either. A new version
 * shows a sticky toast with Reload, and the next in-app link loads its page
 * fresh. Unset (local dev), both sides are null and nothing happens.
 *
 * Pure; see app-version.test.ts.
 */

/** While the tab is showing, how often it asks which version is live. */
export const CHECK_EVERY_MS = 5 * 60_000;

/** One return can fire several triggers together (shown, online, restored): they make one check. */
export const CHECK_GAP_MS = 30_000;

/** Where this browser remembers the live version whose toast the person closed. */
export const DISMISSED_KEY = "hg:update-dismissed";

/**
 * The toast (docs/specs/update-notice.md, section 4). With the icon and the × drawn on touch, the line has 124px
 * at 320 and 179px at 375 (measured in Geist at 16px): this one is 164px, so it shows from 375 up, and
 * UPDATE_LINE_PHONE (98px) below that.
 */
export const UPDATE_LINE = "A new version is ready";
export const UPDATE_LINE_PHONE = "Update ready";

/** The leave sheet's way out when Reload meets unsaved work. */
export const RELOAD_ANYWAY = "Reload anyway";

/** The toast's key, so a second deploy replaces it instead of stacking another. */
export const UPDATE_TOAST_KEY = "app:update";

/**
 * What the tab does now. "current": nothing. "toast": show the toast, and the
 * next link loads fresh. "link-only": the person closed the toast for this
 * version, so only the link rule stays on; a later deploy brings it back.
 */
export type UpdateState = "current" | "toast" | "link-only";

export function updateState(loaded: string | null, live: string | null, dismissed: string | null): UpdateState {
  if (!loaded || !live || live === loaded) return "current";
  return dismissed === live ? "link-only" : "toast";
}

/**
 * Links that open a create sheet over the page, through the @modal slot's
 * intercepting routes (app/(app)/@modal). A full load of one shows its
 * full-page form instead of the sheet, so they open as usual and the next
 * link takes the update.
 */
const SHEET_ROUTES = /^\/(contractors|deals|properties|tasks)\/new\/?$/;

/** The parts of a click that decide whether it's a plain one. */
export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** The link clicked: its resolved href, its target, and whether it downloads. */
export type LinkLike = { href: string; target: string; download: boolean };

/**
 * The page to load in full instead of swapping it in, or null to leave the
 * click alone. Only a plain click (main button, no modifier keys) on a link
 * that stays in this tab and on this site, to another page: a hash on the
 * same page, a new tab, a download, another site or a create sheet goes on
 * as it would.
 */
export function fullLoadHref(click: ClickLike, link: LinkLike | null, here: string): string | null {
  if (!link) return null;
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (link.download) return null;
  if (link.target !== "" && link.target !== "_self") return null;
  let to: URL;
  let from: URL;
  try {
    from = new URL(here);
    to = new URL(link.href, from);
  } catch {
    return null;
  }
  if (to.protocol !== "http:" && to.protocol !== "https:") return null;
  if (to.origin !== from.origin) return null;
  if (to.pathname === from.pathname && to.search === from.search) return null;
  if (SHEET_ROUTES.test(to.pathname)) return null;
  return to.href;
}
