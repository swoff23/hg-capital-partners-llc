import test from "node:test";
import assert from "node:assert/strict";
import { railState } from "./sidebar";

test("railState: keyboard focus inside the rail opens it, as a hover does", () => {
  // Tab landed on an invisible Pin sidebar open (opacity 0) and on icon-only links with no label.
  assert.deepEqual(railState({ pinned: false, hovered: false, keyboardFocus: true }), { expanded: true, floating: true });
  assert.deepEqual(railState({ pinned: false, hovered: true, keyboardFocus: false }), { expanded: true, floating: true });
  assert.deepEqual(railState({ pinned: false, hovered: false, keyboardFocus: false }), { expanded: false, floating: false });
});

test("railState: a pinned rail is open and sits beside the page, never floating", () => {
  for (const hovered of [false, true]) {
    for (const keyboardFocus of [false, true]) {
      assert.deepEqual(railState({ pinned: true, hovered, keyboardFocus }), { expanded: true, floating: false });
    }
  }
});
