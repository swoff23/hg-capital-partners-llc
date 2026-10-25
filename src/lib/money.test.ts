import test from "node:test";
import assert from "node:assert/strict";
import { amountToDecimal, evenShare, moneyParts, parseAmount, toDecimalString } from "./money";

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

test("evenShare: the 765/767 Prospect split, and shares always sum to the total", () => {
  assert.equal(evenShare(292890, 2, 0), 146445);
  assert.equal(evenShare(292890, 2, 1), 146445);
  assert.equal(evenShare(4593, 2, 0, 1), 2297);
  assert.equal(evenShare(4593, 2, 1, 1), 2296);
  assert.equal(evenShare(100, 3, 0), 33.34);
  assert.equal(evenShare(100, 3, 1), 33.33);
  assert.equal(evenShare(100, 3, 2), 33.33);
  for (const [total, parts, step] of [[240000, 2, 0.01], [0.05, 3, 0.01], [1234.57, 4, 0.01], [7, 3, 1]]) {
    const sum = Array.from({ length: parts }, (_, i) => evenShare(total, parts, i, step)).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 100), Math.round(total * 100));
  }
});

test("moneyParts: whole dollars round once, cents stay exact", () => {
  assert.deepEqual(moneyParts(425000, false), { negative: false, dollars: 425000, cents: 0 });
  assert.deepEqual(moneyParts(1450.5, false), { negative: false, dollars: 1451, cents: 0 });
  assert.deepEqual(moneyParts(-1450.5, true), { negative: true, dollars: 1450, cents: 50 });
  assert.deepEqual(moneyParts(0.29, true), { negative: false, dollars: 0, cents: 29 });
  assert.deepEqual(moneyParts(19.999, true), { negative: false, dollars: 20, cents: 0 });
});

test("moneyParts: an amount that rounds to zero has no minus", () => {
  assert.deepEqual(moneyParts(-0.4, false), { negative: false, dollars: 0, cents: 0 });
  assert.deepEqual(moneyParts(-0.004, true), { negative: false, dollars: 0, cents: 0 });
  assert.equal(moneyParts(-0.6, false).negative, true);
});
