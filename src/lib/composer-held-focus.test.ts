import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Nov 3 review's low 9: the shared Composer opens its bar (the audience line, the tools) when focus lands in it,
 * except from a held tray's tiles. Chrome focuses a button on pointerdown, so a tap on a held tile's Remove opened the
 * bar, the tiles moved under the finger, and the tap landed on the bar instead. The Composer is a client component
 * that node:test can't render, so its source is read, as composer-owner.test.ts does.
 */

const composer = readFileSync(join(__dirname, "..", "components", "composer.tsx"), "utf8");

/** The JSX attribute `name={(e) => { ... }}` on the box, read whole. */
function handler(name: "onFocus" | "onBlur"): string {
  const box = composer.indexOf("ref={box}");
  assert.ok(box >= 0, "the box is the element with ref={box}");
  const start = composer.indexOf(`${name}={(e) => {`, box);
  assert.ok(start > box, `the box has its own ${name}`);
  const end = composer.indexOf("}}", start);
  assert.ok(end > start, `${name} closes`);
  return composer.slice(start, end + 2);
}

test("focus from inside the held tray doesn't open the bar; focus anywhere else in the box does", () => {
  const onFocus = handler("onFocus");
  assert.match(onFocus, /if \(!heldTray\.current\?\.contains\(e\.target as Node\)\) setFocused\(true\);/);
  // A bare setFocused(true) is the bug: a tile's button taking focus on pointerdown opened the bar under the finger.
  assert.equal(onFocus.match(/setFocused\(true\)/g)?.length, 1, "the guarded call is the only one");
  assert.equal(composer.match(/setFocused\(true\)/g)?.length, 1, "and nothing else opens it on focus");
});

test("heldTray is the ref on the held tray's own wrapper, which holds the tray and nothing else", () => {
  assert.match(composer, /const heldTray = useRef<HTMLDivElement>\(null\);/);
  assert.match(composer, /\{held\?\.tray && \(\s*<div ref=\{heldTray\}[^>]*>\s*\{held\.tray\}\s*<\/div>\s*\)\}/);
  assert.equal(composer.match(/ref=\{heldTray\}/g)?.length, 1, "on one element only");
  // The field sits outside it, so a real focus of the field still opens the bar.
  const wrapper = composer.indexOf("<div ref={heldTray}");
  assert.ok(composer.indexOf("ref={field}") > composer.indexOf("</div>", wrapper), "the field comes after the tray's wrapper closes");
});

test("leaving the box still closes the bar, wherever focus left from", () => {
  assert.match(handler("onBlur"), /if \(!e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) setFocused\(false\);/);
});
