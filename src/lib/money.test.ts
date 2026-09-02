import test from "node:test";
import assert from "node:assert/strict";
import { amountToDecimal, parseAmount, toDecimalString } from "./money";

test("parseAmount: the shapes people actually type", () => {
  assert.equal(parseAmount("425000"), 425000);
  assert.equal(parseAmount("$425,000"), 425000);
  assert.equal(parseAmount(" 425k "), 425000);
  assert.equal(parseAmount("1.2M"), 1_200_000);
  assert.equal(parseAmount("1.2m"), 1_200_000);
  assert.equal(parseAmount("USD 900"), 900);
  assert.equal(parseAmount("7.25%"), 7.25);
  assert.equal(parseAmount("-2255.56"), -2255.56);
  assert.equal(parseAmount("0"), 0);
  assert.equal(parseAmount(1500), 1500);
});

test("parseAmount: anything that is not one clean number is null", () => {
  assert.equal(parseAmount("300s"), null);
  assert.equal(parseAmount("400-450k"), null);
  assert.equal(parseAmount("ask"), null);
  assert.equal(parseAmount("$"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("   "), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
  assert.equal(parseAmount(NaN), null);
  assert.equal(parseAmount(Infinity), null);
  assert.equal(parseAmount({}), null);
});

test("toDecimalString / amountToDecimal", () => {
  assert.equal(toDecimalString(425000), "425000.00");
  assert.equal(toDecimalString(7.255), "7.25"); // toFixed rounding, matches previous behaviour
  assert.equal(toDecimalString(null), null);
  assert.equal(amountToDecimal("425k"), "425000.00");
  assert.equal(amountToDecimal("300s"), null);
});
