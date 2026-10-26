import test from "node:test";
import assert from "node:assert/strict";
import { keyboardInset } from "./use-keyboard-inset";

test("keyboardInset: 0 with no keyboard or no visualViewport", () => {
  assert.equal(keyboardInset(667, { height: 667, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(667, null), 0);
  assert.equal(keyboardInset(667, undefined), 0);
});

test("keyboardInset: what the keyboard covers below the visual viewport", () => {
  // iPhone SE: a 260px keyboard leaves 407px of the 667px page in view.
  assert.equal(keyboardInset(667, { height: 407, offsetTop: 0 }), 260);
  // Safari scrolled the visual viewport down 100px to show the field.
  assert.equal(keyboardInset(667, { height: 407, offsetTop: 100 }), 160);
  // Sub-pixel heights round; a visual viewport taller than the page never goes negative.
  assert.equal(keyboardInset(667, { height: 406.6, offsetTop: 0 }), 260);
  assert.equal(keyboardInset(667, { height: 700, offsetTop: 0 }), 0);
});
