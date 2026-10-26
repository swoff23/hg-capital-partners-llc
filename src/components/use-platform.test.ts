import test from "node:test";
import assert from "node:assert/strict";
import { modKeyFor, shortcutLabel } from "./use-platform";

test("modKeyFor: ⌘ on Apple platforms, Ctrl elsewhere", () => {
  for (const p of ["MacIntel", "macOS", "iPhone", "iPad", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"]) {
    assert.equal(modKeyFor(p), "⌘", p);
  }
  for (const p of ["Win32", "Windows", "Linux x86_64", "Android", "Chrome OS", ""]) {
    assert.equal(modKeyFor(p), "Ctrl", p);
  }
});

test("shortcutLabel: ⌘K runs together, Ctrl K keeps a space", () => {
  assert.equal(shortcutLabel("⌘", "K"), "⌘K");
  assert.equal(shortcutLabel("Ctrl", "K"), "Ctrl K");
  assert.equal(shortcutLabel("⌘", "↵"), "⌘↵");
});
