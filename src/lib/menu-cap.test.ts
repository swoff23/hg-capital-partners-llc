import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Design call 24 (Nov 14): an anchored menu is capped at the screen width less the 16px gutters, and an item's
 * label and description wrap when the cap bites. Menu is a client component node:test can't render, so its source
 * is read here, as composer-held-focus.test.ts does; the layout itself is checked in a browser at 320 (three menus
 * keep their size with today's words, and a long label wraps inside the cap).
 */

const menu = readFileSync(join(__dirname, "..", "components", "menu.tsx"), "utf8");
const between = (from: string, to: string) => {
  const start = menu.indexOf(from);
  assert.ok(start >= 0, `menu.tsx has ${from}`);
  const end = menu.indexOf(to, start);
  assert.ok(end > start, `${from} runs to ${to}`);
  return menu.slice(start, end);
};

test("the anchored panel is capped at the screen less the gutters, the cap the menu's header already had", () => {
  const panel = between("<PopoverSurface", ">\n      {step ?");
  assert.match(panel, /className=\{cn\("min-w-40 max-w-\[calc\(100vw_-_2rem\)\]", !step && "w-max"\)\}/);
  // The same words as MenuHeader's own cap, so the two can't drift.
  assert.equal(menu.match(/max-w-\[calc\(100vw_-_2rem\)\]/g)?.length, 2);
});

test("the list takes its content's width first, so an item wraps only at the cap and never early", () => {
  // Without w-max a panel anchored near the right edge would be offered less room and wrap words that fit.
  assert.match(between("<PopoverSurface", ">\n      {step ?"), /!step && "w-max"/);
});

test("an item's label and description can wrap: no nowrap on the row, no truncate on either line", () => {
  const item = between("export function MenuItem(", "export function MenuSection");
  assert.doesNotMatch(item, /whitespace-nowrap rounded-sm/);
  assert.match(item, /"flex cursor-default select-none items-center gap-2 rounded-sm px-2 text-body outline-none \[overflow-wrap:anywhere\]"/);
  assert.match(item, /<Text slot="label">\{children\}<\/Text>/);
  assert.match(item, /<Text slot="description" className="text-meta text-muted-foreground">/);
  assert.doesNotMatch(item, /truncate/);
});

test("a row is at least its old height and grows only for a second line", () => {
  const item = between("export function MenuItem(", "export function MenuSection");
  // h-8 and h-11 became minimums; py-1 leaves a one-line row (20px of text, 22 on touch) at exactly 32 and 44.
  assert.match(item, /description \? "min-h-11 py-1\.5 pointer-coarse:min-h-14" : "min-h-8 py-1 pointer-coarse:min-h-11"/);
  assert.doesNotMatch(item, /"h-8 pointer-coarse:h-11"/);
});

test("the printed shortcut keeps its size when a label wraps beside it", () => {
  assert.match(menu, /<Keyboard [^>]*className=\{cn\(kbdClass, "ml-auto shrink-0 whitespace-nowrap"\)\}>/);
});
