import test from "node:test";
import assert from "node:assert/strict";
import { RENT_LIMIT, amountProblem, badNumbersMessage, readAmount, readRate, readWholeNumber } from "./numbers";

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

test("readAmount: a number too large for its column is refused with the limit, not sent to fail in the database", () => {
  // The tester's Value entries: both used to come back as "Something went wrong".
  for (const big of ["99999999999999999999", "9007199254740993", "10,000,000,000", "$10000m", "9999999999.995"]) {
    assert.deepEqual(readAmount(big), { ok: false, tooLarge: true }, big);
  }
  // The largest a Decimal(12,2) holds, and 2,147,483,648 (past int32), still save.
  assert.deepEqual(readAmount("9,999,999,999.99"), { ok: true, value: "9999999999.99" });
  assert.deepEqual(readAmount("2147483648"), { ok: true, value: "2147483648.00" });
  // A listing's rent is Decimal(10,2).
  assert.deepEqual(readAmount("100,000,000", RENT_LIMIT), { ok: false, tooLarge: true });
  assert.deepEqual(readAmount("1,500", RENT_LIMIT), { ok: true, value: "1500.00" });
});

test("readWholeNumber: square feet past 10 million are refused with the limit", () => {
  assert.deepEqual(readWholeNumber("99999999999"), { ok: false, tooLarge: true });
  assert.deepEqual(readWholeNumber("9,999,999"), { ok: true, value: 9_999_999 });
});

test("badNumbersMessage: a number too large says the limit in one line", () => {
  assert.equal(badNumbersMessage(["value"], ["value"]), "Keep it under $10 billion.");
  assert.equal(badNumbersMessage(["currentLoan"], ["currentLoan"]), "Keep it under $10 billion.");
  assert.equal(badNumbersMessage(["sqft"], ["sqft"]), "Keep it under 10,000,000.");
  assert.equal(badNumbersMessage(["rehabMonths"], ["rehabMonths"]), "Keep it under 1,000,000.");
  // Two fields still name both.
  assert.equal(badNumbersMessage(["value", "sqft"], ["value"]), "Check Value and Sq ft.");
});

test("amountProblem: the rail's check before it sends, for money and square feet only", () => {
  assert.equal(amountProblem("value", "99999999999999999999"), "Keep it under $10 billion.");
  assert.equal(amountProblem("value", "425,000"), null);
  assert.equal(amountProblem("value", ""), null);
  // Text that isn't a number is the field kit's own line, not this one.
  assert.equal(amountProblem("value", "abc"), null);
  assert.equal(amountProblem("sqft", "99999999999"), "Keep it under 10,000,000.");
  assert.equal(amountProblem("rehabMonths", "1000000"), "Keep it under 1,000,000.");
  // Not a number field: nothing to say.
  assert.equal(amountProblem("lender", "99999999999999999999"), null);
  assert.equal(amountProblem("loanRate", "99999999999999999999"), null);
});
