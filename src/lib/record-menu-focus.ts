/**
 * Restore on an archived record's notice (components/record-archive.tsx)
 * unmounts, button and all, when the restore lands, and focus falls to the
 * page: a keyboard user loses their place, and Esc and Tab start over from the
 * top. The record's ⋯ button is the next stop in its header, so the notice
 * hands focus there, the way Restore from the ⋯ menu leaves it. Pure DOM
 * lookups, so record-menu-focus.test.ts runs it on a stand-in.
 */

/** The attribute that marks a record's ⋯ button, so the notice can find it. */
export const RECORD_MENU_ATTR = "data-record-menu";

/** Focuses the record's ⋯ button. False when the page has none (nothing to hand focus to). */
export function focusRecordMenu(root: Pick<ParentNode, "querySelector"> | null = typeof document === "undefined" ? null : document): boolean {
  const button = root?.querySelector<HTMLElement>(`[${RECORD_MENU_ATTR}]`);
  if (!button) return false;
  // The ⋯ draws a focus ring only for the keyboard, so a mouse click on Restore shows nothing new.
  button.focus();
  return true;
}
