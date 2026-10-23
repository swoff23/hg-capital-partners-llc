import test from "node:test";
import assert from "node:assert/strict";
import { officeTelHref } from "./office";

test("a set number becomes a tel: link; an empty or malformed one hides the button", () => {
  assert.equal(officeTelHref("+1 (716) 555-1234"), "tel:+17165551234");
  assert.equal(officeTelHref("7165551234"), "tel:7165551234");
  assert.equal(officeTelHref(""), null);
  assert.equal(officeTelHref("555-1234"), null);
});
