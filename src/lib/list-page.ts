/**
 * A long list shows a page of rows at a time: the first LIST_PAGE, and Show more asks for another through the
 * URL (?show=200). The page size, the ceiling and the footer's words live here, once, so two lists never tell a
 * partner two different things at the same wall. Tasks has a ceiling; a list with none (Deals) passes
 * `ceiling: null` and keeps offering Show more until every row is on the page.
 *
 * `components/list-footer.tsx` `ListFooter` draws the line. Pure; see list-page.test.ts.
 */

/** Rows a list opens with, and what Show more adds each time. */
export const LIST_PAGE = 100;

/** The most a list with a ceiling shows (Tasks). Past it, the search box and the filters are the way to the rest. */
export const LIST_CEILING = 400;

/** With no ceiling, `show` still stops at a row count the database takes. */
const MOST_ROWS = 1_000_000;

const n = (count: number) => count.toLocaleString("en-US");

/**
 * How many rows the URL asks for (`show`): whole pages of LIST_PAGE, from one page up to the ceiling, or as many
 * as asked when the list has none (`ceiling: null`). Anything that isn't a number, a repeated param, or a number
 * under one page is the first page.
 */
export function listLimit(show: string | string[] | undefined, opts: { ceiling: number | null }): number {
  const asked = typeof show === "string" ? Number.parseInt(show, 10) : Number.NaN;
  if (!Number.isFinite(asked)) return LIST_PAGE;
  return Math.min(opts.ceiling ?? MOST_ROWS, Math.max(LIST_PAGE, Math.ceil(asked / LIST_PAGE) * LIST_PAGE));
}

/** The footer's one line, and the `show` its Show more button asks for (null: no button). */
export type ListFooterLine = { line: string; more: number | null };

/**
 * What the foot of a long list says, or null when every row is on the page. `shown` is how many rows the page
 * asked for (`listLimit`), `total` how many the view holds.
 *
 *  - More to show: "Showing 100 of 206", with Show more.
 *  - At the ceiling: "First 400 of 2,036. Search or filter for more." and no button. One line at 320 (276px of
 *    288 at the phone's 14px), naming both controls that reach the rest.
 */
export function listFooter(shown: number, total: number, opts: { ceiling: number | null }): ListFooterLine | null {
  if (total <= shown) return null;
  if (opts.ceiling !== null && shown >= opts.ceiling) {
    return { line: `First ${n(opts.ceiling)} of ${n(total)}. Search or filter for more.`, more: null };
  }
  return { line: `Showing ${n(shown)} of ${n(total)}`, more: shown + LIST_PAGE };
}
