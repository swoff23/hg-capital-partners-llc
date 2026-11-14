import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Lists and loading screens (Nov 14), read from source as the repo's other component wiring tests do: Deals'
 * page of 100 with the shared footer, the loading bar holding each count's place, Home's Needs you block, and
 * the contractor page's "See all jobs" row.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const APP = "../app/(app)/";

test("Deals shows a page of 100 through the shared footer, with no ceiling and no cap sentences", () => {
  const page = read(`${APP}deals/(list)/page.tsx`);
  assert.match(page, /const take = listLimit\(sp\.show, \{ ceiling: null \}\);/);
  assert.match(page, /<ListFooter shown=\{take\} total=\{shown\} \/>/);
  assert.match(page, /take, select: LIST_COLUMNS/, "the plain sorts take the page");
  assert.match(page, /firstByStage\(keys, desc, take\)/, "the Stage sort ranks first, then takes the page");
  assert.doesNotMatch(page, /\bCAP\b|Showing first|First \{|Search or filter to see the rest|Search for more/);
  assert.doesNotMatch(page, /ceiling: \d|TASK_PAGE_MAX|LIST_CEILING/);
  // A filter change starts the page over, as on Tasks.
  assert.match(read(`${APP}deals/filters.tsx`), /<FilterScope list="deals" defaults=\{DEFAULTS\} transient=\{TRANSIENT\}>/);
  assert.match(read(`${APP}deals/filters.tsx`), /const TRANSIENT = \["show"\] as const;/);
});

test("the Deals loading bar holds each view's count place, in the segments and in the tablet button", () => {
  const filters = read(`${APP}deals/filters.tsx`);
  assert.match(filters, /const COUNT_SLOT = <span aria-hidden="true" className="invisible">00<\/span>;/);
  assert.match(filters, /options: DEAL_VIEWS\.map\(\(v\) => \(\{ key: v\.key, label: v\.label, mark: COUNT_SLOT \}\)\),/);
  // The live bar's options still carry the counts, and nothing is drawn in the slot (no text, no fill).
  assert.match(filters, /label: v\.label, count: data\.counts\[v\.key\] \}/);
  const bar = read("../components/filter-bar.tsx");
  assert.match(bar, /options: readonly \{ key: string; label: string; mark\?: ReactNode \}\[\]/);
  assert.match(bar, /\{current\.mark && <span className="tabular-nums max-sm:hidden">\{current\.mark\}<\/span>\}/);
  // Phones show no count, so the menu button's slot hides there too, as ViewMenu's count does.
  assert.match(bar, /\{current\.count !== undefined && <span className="tabular-nums text-fg-3 max-sm:hidden">/);
});

test("Home's loading screen draws Needs you above Mine and Contractors, with the page's own gap", () => {
  const loading = read(`${APP}(home)/loading.tsx`);
  const page = read(`${APP}(home)/page.tsx`);
  const needs = loading.indexOf('title={<Block text="text-section"');
  assert.ok(needs > 0 && needs < loading.indexOf("Mine | Contractors switch"));
  assert.match(loading, /className="mb-8 pointer-coarse:mb-6"/);
  assert.match(page, /<NeedsYou items=\{items\} className="mb-8 pointer-coarse:mb-6" \/>/, "the same gap as the page");
  // One row, two lines: a title block over a place block.
  assert.equal((loading.match(/<li className="-mx-2 flex min-h-10/g) ?? []).length, 1);
});

test("a contractor's page ends a long Jobs list with a See all jobs row to Tasks on All", () => {
  const page = read(`${APP}contractors/[id]/page.tsx`);
  assert.match(page, /<Link href=\{`\/tasks\?status=all&owner=c:\$\{id\}`\} className="flex min-h-10 items-center border-t border-line text-label text-fg-2 [^"]*pointer-coarse:min-h-12">See all jobs<\/Link>/);
  assert.doesNotMatch(page, /Showing the latest/);
});
