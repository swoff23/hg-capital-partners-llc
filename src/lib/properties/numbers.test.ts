import test from "node:test";
import assert from "node:assert/strict";
import { badNumbersMessage, readAmount, readRate, readWholeNumber } from "./numbers";

test("readAmount: blank clears, clean numbers store, typos are refused", () => {
  assert.deepEqual(readAmount(""), { ok: true, value: null });
  assert.deepEqual(readAmount("   "), { ok: true, value: null });
  assert.deepEqual(readAmount(null), { ok: true, value: null });
  assert.deepEqual(readAmount("550,000"), { ok: true, value: "550000.00" });
  assert.deepEqual(readAmount("$550k"), { ok: true, value: "550000.00" });
  assert.deepEqual(readAmount("8k"), { ok: true, value: "8000.00" });
  for (const typo of ["55o,000", "abc", "400-450k", "550,000 or so", "k", "$"]) {
    assert.deepEqual(readAmount(typo), { ok: false }, typo);
  }
});

test("readRate: three decimals, and a forgotten point is refused", () => {
  assert.deepEqual(readRate(""), { ok: true, value: null });
  assert.deepEqual(readRate("6.875"), { ok: true, value: "6.875" });
  assert.deepEqual(readRate("6.875%"), { ok: true, value: "6.875" });
  assert.deepEqual(readRate("7.25"), { ok: true, value: "7.250" });
  assert.deepEqual(readRate("0"), { ok: true, value: "0.000" });
  for (const bad of ["6875", "-1", "abc", "101"]) assert.deepEqual(readRate(bad), { ok: false }, bad);
});

test("readWholeNumber: square feet", () => {
  assert.deepEqual(readWholeNumber(""), { ok: true, value: null });
  assert.deepEqual(readWholeNumber("2,300"), { ok: true, value: 2300 });
  assert.deepEqual(readWholeNumber(" 4593 "), { ok: true, value: 4593 });
  for (const bad of ["-5", "2300.5", "abc", "2e3"]) {
    assert.deepEqual(readWholeNumber(bad), { ok: false }, bad);
  }
});

test("badNumbersMessage: names the fields in one short line", () => {
  assert.equal(badNumbersMessage(["value"]), "Value isn't a number.");
  assert.equal(badNumbersMessage(["replacementCost"]), "Replacement cost isn't a number.");
  assert.equal(badNumbersMessage(["sqft"]), "Sq ft isn't a whole number.");
  assert.equal(badNumbersMessage(["loanRate"]), "Rate needs a percentage, like 6.875.");
  assert.equal(badNumbersMessage(["value", "sqft"]), "Check Value and Sq ft.");
  assert.equal(badNumbersMessage(["value", "loanRate", "insurancePremium"]), "Check Value, Rate and Premium.");
  for (const m of [badNumbersMessage(["replacementCost"]), badNumbersMessage(["loanOriginalAmount", "loanPaymentMonthly"])]) {
    assert.ok(m.length <= 43, `${m} (${m.length}) fits a section card on one line`);
  }
});
