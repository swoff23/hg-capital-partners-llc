import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SHEET_PATHS, focusHeadingAfter, isSheetPath } from "./sheet-routes";

const SLOT = join(process.cwd(), "src/app/(app)/@modal");

test("SHEET_PATHS names every sheet route in the @modal slot", () => {
  const found: string[] = [];
  for (const dir of readdirSync(SLOT, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("(.)")) continue;
    const base = dir.name.slice(3);
    for (const sub of readdirSync(join(SLOT, dir.name), { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const page = readFileSync(join(SLOT, dir.name, sub.name, "page.tsx"), "utf8");
      // A fixed path as a string, or a record's as a template: path={`/deals/${id}`} reads as /deals/[id].
      const path = page.match(/<SheetRoute path=(?:"([^"]+)"|\{`([^`]+)`\})/)?.slice(1).find(Boolean)?.replace(/\$\{(\w+)\}/g, "[$1]");
      assert.equal(path, `/${base}/${sub.name}`, `${dir.name}/${sub.name}/page.tsx`);
      found.push(path);
    }
  }
  assert.deepEqual([...found].sort(), [...SHEET_PATHS].sort());
});

test("focusHeadingAfter: a sheet opening or closing onto its page leaves focus to the sheet", () => {
  assert.equal(focusHeadingAfter("/tasks", "/tasks/new", null), false);
  assert.equal(focusHeadingAfter("/tasks/new", "/tasks", "/tasks"), false);
});

test("focusHeadingAfter: a deal opens as a sheet, and closes back onto the page it opened over", () => {
  assert.equal(focusHeadingAfter("/deals", "/deals/d_1", null), false);
  assert.equal(focusHeadingAfter("/deals/d_1", "/deals", "/deals"), false);
  // Opened by a full load, it closes onto the list as a new page.
  assert.equal(focusHeadingAfter("/deals/d_1", "/deals", null), true);
});

test("isSheetPath: a deal's one segment, nothing under it", () => {
  assert.equal(isSheetPath("/deals/d_1"), true);
  assert.equal(isSheetPath("/deals/new"), true);
  assert.equal(isSheetPath("/deals"), false);
  assert.equal(isSheetPath("/deals/d_1/more"), false);
  assert.equal(isSheetPath("/tasks/t_1"), false);
});

test("focusHeadingAfter: a sheet that ends in another page, and every other route change, moves focus", () => {
  assert.equal(focusHeadingAfter("/tasks/new", "/tasks/t_1", "/tasks"), true);
  assert.equal(focusHeadingAfter("/tasks", "/deals", null), true);
  // Back from a sheet that was opened over a different page (a pasted link, then Back).
  assert.equal(focusHeadingAfter("/tasks/new", "/tasks", null), true);
});
