import test from "node:test";
import assert from "node:assert/strict";
import { badNumbersMessage, readAmount, readWholeNumber } from "./numbers";

test("readAmount: blank clears, clean numbers store, typos are refused", () => {
  assert.deepEqual(readAmount(""), { ok: true, value: null });
  assert.deepEqual(readAmount("   "), { ok: true, value: null });
  assert.deepEqual(readAmount(null), { ok: true, value: null });
  assert.deepEqual(readAmount("550,000"), { ok: true, value: "550000.00" });
  assert.deepEqual(readAmount("$550k"), { ok: true, value: "550000.00" });
  assert.deepEqual(readAmount("7.25%"), { ok: true, value: "7.25" });
  for (const typo of ["55o,000", "abc", "400-450k", "550,000 or so"]) {
    assert.deepEqual(readAmount(typo), { ok: false }, typo);
  }
});

test("readWholeNumber: square feet", () => {
  assert.deepEqual(readWholeNumber(""), { ok: true, value: null });
  assert.deepEqual(readWholeNumber("2,300"), { ok: true, value: 2300 });
  assert.deepEqual(readWholeNumber(" 4593 "), { ok: true, value: 4593 });
  for (const bad of ["-5", "2300.5", "abc", "2e3"]) {
    assert.deepEqual(readWholeNumber(bad), { ok: false }, bad);
  }
});

test("badNumbersMessage: names the field and shows the shape to type", () => {
  assert.equal(badNumbersMessage(["value"]), "Value isn't a number. Enter it like 550,000.");
  assert.equal(badNumbersMessage(["sqft"]), "Sq ft isn't a whole number. Enter it like 2,300.");
  assert.equal(badNumbersMessage(["value", "sqft"]), "Value and Sq ft need numbers, like 550,000 and 2,300.");
  assert.equal(
    badNumbersMessage(["value", "loanRate", "insurancePremium"]),
    "Value, Rate and Premium need numbers, like 550,000, 7.25 and 3,200.",
  );
});
