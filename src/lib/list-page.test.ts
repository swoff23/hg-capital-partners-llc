import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIST_CEILING, LIST_PAGE, listFooter, listLimit } from "./list-page";
import { TASK_PAGE, TASK_PAGE_MAX, taskLimit } from "./tasks/list-query";

// Design call 25 (Nov 14): one list footer and one helper for the page size, the ceiling and the words. Tasks uses
// it with its 400 ceiling; a list with none (Deals, design call 9) passes `ceiling: null`.

test("the page size and the ceiling live here, and Tasks reads them", () => {
  assert.equal(LIST_PAGE, 100);
  assert.equal(LIST_CEILING, 400);
  assert.equal(TASK_PAGE, LIST_PAGE);
  assert.equal(TASK_PAGE_MAX, LIST_CEILING);
  // list-query keeps no number of its own.
  const query = readFileSync(join(__dirname, "tasks", "list-query.ts"), "utf8");
  assert.match(query, /export const TASK_PAGE = LIST_PAGE;/);
  assert.match(query, /export const TASK_PAGE_MAX = LIST_CEILING;/);
  assert.match(query, /return listLimit\(str\(sp\.show\), \{ ceiling: TASK_PAGE_MAX \}\);/);
});

test("listLimit with a ceiling: whole pages from one to the ceiling, as the Tasks page always asked", () => {
  const at = (show: string | string[] | undefined) => listLimit(show, { ceiling: LIST_CEILING });
  assert.equal(at(undefined), 100);
  assert.equal(at("100"), 100);
  assert.equal(at("150"), 200, "rounds up to a whole page");
  assert.equal(at("400"), 400);
  assert.equal(at("401"), 400);
  assert.equal(at("100000"), 400);
  for (const junk of ["", "all", "-300", "0", "1"]) assert.equal(at(junk), 100, junk);
  assert.equal(at(["200", "300"]), 100, "a repeated param is read as none");
  // The same answers taskLimit gives.
  for (const show of ["", "1", "150", "400", "401", "x"]) assert.equal(taskLimit({ show }), at(show), show);
});

test("listLimit with no ceiling: Show more keeps going, in whole pages", () => {
  const at = (show: string | undefined) => listLimit(show, { ceiling: null });
  assert.equal(at(undefined), 100);
  assert.equal(at("400"), 400);
  assert.equal(at("500"), 500, "past where Tasks stops");
  assert.equal(at("428"), 500);
  assert.equal(at("2100"), 2100);
  assert.equal(at("junk"), 100);
  // Still a row count the database takes, whatever the URL says.
  assert.ok(Number.isSafeInteger(at("999999999999999999999")));
  assert.ok(at("999999999999999999999") <= 1_000_000);
});

test("listFooter: nothing when every row is on the page", () => {
  assert.equal(listFooter(100, 100, { ceiling: LIST_CEILING }), null);
  assert.equal(listFooter(100, 37, { ceiling: LIST_CEILING }), null);
  assert.equal(listFooter(400, 400, { ceiling: LIST_CEILING }), null);
  assert.equal(listFooter(500, 428, { ceiling: null }), null);
  assert.equal(listFooter(100, 0, { ceiling: null }), null);
});

test("listFooter: below the ceiling it counts the rows and offers the next page", () => {
  assert.deepEqual(listFooter(100, 206, { ceiling: LIST_CEILING }), { line: "Showing 100 of 206", more: 200 });
  assert.deepEqual(listFooter(300, 2036, { ceiling: LIST_CEILING }), { line: "Showing 300 of 2,036", more: 400 });
});

test("listFooter: at the ceiling it is one sentence that names both ways to the rest, with no button", () => {
  const foot = listFooter(400, 2036, { ceiling: LIST_CEILING });
  assert.deepEqual(foot, { line: "First 400 of 2,036. Search or filter for more.", more: null });
  // 46 characters: 276px at the phone's 14px, inside the 288px a 320 screen has. The old line was 63 and wrapped.
  assert.equal(foot!.line.length, 46);
  assert.doesNotMatch(foot!.line, /Narrow|Showing/);
  assert.equal(foot!.line.includes(String.fromCharCode(8212)), false, "no em dash");
  // A five-figure total still reads whole; the component truncates anything longer before it would wrap.
  assert.equal(listFooter(400, 12345, { ceiling: LIST_CEILING })!.line, "First 400 of 12,345. Search or filter for more.");
});

test("listFooter with no ceiling: Show more at every page, so a view of 428 never stops at 400", () => {
  assert.deepEqual(listFooter(100, 428, { ceiling: null }), { line: "Showing 100 of 428", more: 200 });
  assert.deepEqual(listFooter(400, 428, { ceiling: null }), { line: "Showing 400 of 428", more: 500 });
  assert.deepEqual(listFooter(1100, 2036, { ceiling: null }), { line: "Showing 1,100 of 2,036", more: 1200 });
  assert.equal(listFooter(listLimit("500", { ceiling: null }), 428, { ceiling: null }), null);
});

test("the footer component draws the helper's line on one truncated line, and Tasks uses it with its ceiling", () => {
  const footer = readFileSync(join(__dirname, "..", "components", "list-footer.tsx"), "utf8");
  assert.match(footer, /const foot = listFooter\(shown, total, \{ ceiling \}\);\s*if \(!foot\) return null;/);
  // min-w-0 with truncate: the line gives way before it wraps, and the button beside it keeps its size.
  assert.match(footer, /<p className="min-w-0 truncate text-meta tabular-nums text-muted-foreground">\{foot\.line\}<\/p>/);
  assert.match(footer, /\{foot\.more !== null && <ScopeButton changes=\{\{ show: String\(foot\.more\) \}\}>Show more<\/ScopeButton>\}/);
  assert.match(footer, /ceiling = null,/, "no ceiling unless the list passes one");
  const tasks = readFileSync(join(__dirname, "..", "app", "(app)", "tasks", "(list)", "page.tsx"), "utf8");
  assert.match(tasks, /<ListFooter shown=\{take\} total=\{total\} ceiling=\{TASK_PAGE_MAX\} \/>/);
  assert.doesNotMatch(tasks, /Narrow the filters|Showing first/);
});
