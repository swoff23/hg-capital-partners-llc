/**
 * The paths that open as a sheet over the page they were linked from: the
 * intercepting pages in `app/(app)/@modal`, each wrapped in `SheetRoute`
 * (components/create-form.tsx). A new create sheet adds its path here;
 * sheet-routes.test.ts fails when a page in the slot is missing.
 *
 * The app shell reads it: it moves focus to a new page's heading, but a
 * sheet looks after focus itself and gives it back to what opened it.
 */
export const SHEET_PATHS: readonly string[] = ["/tasks/new", "/deals/new", "/properties/new", "/contractors/new"];

export const isSheetPath = (path: string): boolean => SHEET_PATHS.includes(path);

/**
 * Whether the shell should move focus to the heading after a route change
 * from `from` to `to`. Not when a sheet opens (it takes focus itself), and
 * not when one closes back onto the page it opened over (focus goes back to
 * its opener, which the heading would take from it). A sheet that ends in
 * another page, a new record, is a new page like any other.
 */
export function focusHeadingAfter(from: string, to: string, openedOver: string | null): boolean {
  if (isSheetPath(to)) return false;
  if (isSheetPath(from) && to === openedOver) return false;
  return true;
}
