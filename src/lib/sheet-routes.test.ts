import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SHEET_PATHS, focusHeadingAfter } from "./sheet-routes";

const SLOT = join(process.cwd(), "src/app/(app)/@modal");

test("SHEET_PATHS names every sheet route in the @modal slot", () => {
  const found: string[] = [];
  for (const dir of readdirSync(SLOT, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("(.)")) continue;
    const base = dir.name.slice(3);
    for (const sub of readdirSync(join(SLOT, dir.name), { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const page = readFileSync(join(SLOT, dir.name, sub.name, "page.tsx"), "utf8");
      const path = page.match(/<SheetRoute path="([^"]+)"/)?.[1];
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

test("focusHeadingAfter: a sheet that ends in another page, and every other route change, moves focus", () => {
  assert.equal(focusHeadingAfter("/deals/new", "/deals/d_1", "/deals"), true);
  assert.equal(focusHeadingAfter("/tasks", "/deals", null), true);
  // Back from a sheet that was opened over a different page (a pasted link, then Back).
  assert.equal(focusHeadingAfter("/tasks/new", "/tasks", null), true);
});
