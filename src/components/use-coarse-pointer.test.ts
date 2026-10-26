import test from "node:test";
import assert from "node:assert/strict";
import { containerFor, pickContainer } from "./use-coarse-pointer";

test("containerFor: a sheet only on a touch phone", () => {
  assert.equal(containerFor({ coarse: true, phone: true }), "sheet");
  assert.equal(containerFor({ coarse: true, phone: false }), "popover"); // a touch tablet: popover with touch rows
  assert.equal(containerFor({ coarse: false, phone: true }), "popover"); // a narrow window with a mouse
  assert.equal(containerFor({ coarse: false, phone: false }), "popover");
});

test("pickContainer: the popover when there's no window (server render)", () => {
  assert.equal(pickContainer(), "popover");
});
