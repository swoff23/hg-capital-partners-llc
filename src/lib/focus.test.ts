import test from "node:test";
import assert from "node:assert/strict";
import { returnFocusAfterSave } from "./focus";

const body = { tagName: "BODY" } as unknown as Element;
const field = { tagName: "INPUT" } as unknown as Element;

test("returnFocusAfterSave: a refused save puts focus back where Esc reaches the sheet", () => {
  // Save unit was pressed, turned busy (disabled), and focus fell to <body>; the refusal came back.
  assert.equal(returnFocusAfterSave({ was: true, pending: false, isOpen: true, active: body, body }), true);
  assert.equal(returnFocusAfterSave({ was: true, pending: false, isOpen: true, active: null, body }), true);
});

test("returnFocusAfterSave: leaves focus alone otherwise", () => {
  // Still saving.
  assert.equal(returnFocusAfterSave({ was: true, pending: true, isOpen: true, active: body, body }), false);
  // Saved and closed: focus goes back to what opened the sheet.
  assert.equal(returnFocusAfterSave({ was: true, pending: false, isOpen: false, active: body, body }), false);
  // A field already holds focus (the refusal's first invalid field).
  assert.equal(returnFocusAfterSave({ was: true, pending: false, isOpen: true, active: field, body }), false);
  // Nothing was saving.
  assert.equal(returnFocusAfterSave({ was: false, pending: false, isOpen: true, active: body, body }), false);
});
