import test from "node:test";
import assert from "node:assert/strict";
import { amountToDecimal, evenShare, moneyParts, parseAmount, readNumber, savesAs, tidyAmount, toDecimalString } from "./money";

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

test("tidyAmount: a clean number reads in its grouped form once the field is left", () => {
  assert.equal(tidyAmount("money", "425000"), "425,000");
  assert.equal(tidyAmount("money", "$1,234.567"), "1,234.57");
  assert.equal(tidyAmount("money", "425k"), "425,000");
  assert.equal(tidyAmount("percent", "6.875"), "6.875");
  assert.equal(tidyAmount("decimal", "1200.50"), "1200.5");
  assert.equal(tidyAmount("year", "2014"), "2014");
  assert.equal(tidyAmount("integer", "1200"), "1,200");
  assert.equal(tidyAmount("integer", "3"), "3");
  assert.equal(tidyAmount("integer", "2k"), "2,000");
});

test("tidyAmount: an integer field keeps a fraction as typed instead of rounding it", () => {
  // Custom repeat's count: "1.5" used to blur to "2" and save every 2 weeks; now it stays for the error line.
  assert.equal(tidyAmount("integer", "1.5"), null);
  assert.equal(tidyAmount("integer", "2.4"), null);
  assert.equal(tidyAmount("integer", "0.5"), null);
  assert.equal(tidyAmount("integer", "-1.5"), null);
  // Whole numbers written with a decimal point are still whole.
  assert.equal(tidyAmount("integer", "4.0"), "4");
  // The fields that always rounded still do.
  assert.equal(tidyAmount("year", "2014.6"), "2015");
});

test("tidyAmount: text that is not one number is left as typed", () => {
  assert.equal(tidyAmount("money", "low 400s"), null);
  assert.equal(tidyAmount("integer", ""), null);
  assert.equal(tidyAmount("integer", "two"), null);
  assert.equal(tidyAmount("percent", "5 to 6"), null);
});

// ---------------------------------------------------------------------------
// readNumber and savesAs: parseAmount for every kind (forms 2.3)
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-26T12:00:00Z");

test("readNumber money: the shapes people type, a blank clears, text is refused", () => {
  for (const [typed, value] of [["425000", 425000], ["425,000", 425000], ["$425k", 425000], ["1.2m", 1_200_000], ["8k", 8000], ["1842.17", 1842.17]] as const) {
    assert.deepEqual(readNumber("money", typed, NOW), { ok: true, value }, typed);
  }
  assert.deepEqual(readNumber("money", "  ", NOW), { ok: true, value: null });
  for (const typed of ["low 400s", "400-450k", "ask", "-5"]) {
    assert.deepEqual(readNumber("money", typed, NOW), { ok: false, message: "Enter an amount, like 425,000." }, typed);
  }
});

test("readNumber percent: 6.875 and 6.875%, within 0 to 100", () => {
  assert.deepEqual(readNumber("percent", "6.875", NOW), { ok: true, value: 6.875 });
  assert.deepEqual(readNumber("percent", "6.875%", NOW), { ok: true, value: 6.875 });
  assert.deepEqual(readNumber("percent", "0", NOW), { ok: true, value: 0 });
  assert.deepEqual(readNumber("percent", "100", NOW), { ok: true, value: 100 });
  // A forgotten decimal point ("6875") is refused, as the server's readRate refuses it.
  assert.deepEqual(readNumber("percent", "6875", NOW), { ok: false, message: "Enter a rate, like 6.875." });
  assert.deepEqual(readNumber("percent", "six", NOW), { ok: false, message: "Enter a rate, like 6.875." });
});

test("readNumber integer: whole numbers with grouping; a fraction is refused, not rounded", () => {
  assert.deepEqual(readNumber("integer", "1,200", NOW), { ok: true, value: 1200 });
  assert.deepEqual(readNumber("integer", "4.0", NOW), { ok: true, value: 4 });
  assert.deepEqual(readNumber("integer", "1.5", NOW), { ok: false, message: "Enter a whole number." });
  assert.deepEqual(readNumber("integer", "-2", NOW), { ok: false, message: "Enter a whole number." });
  assert.deepEqual(readNumber("integer", "two", NOW), { ok: false, message: "Enter a whole number." });
});

test("readNumber year: 1900 to next year", () => {
  assert.deepEqual(readNumber("year", "2014", NOW), { ok: true, value: 2014 });
  assert.deepEqual(readNumber("year", "1900", NOW), { ok: true, value: 1900 });
  assert.deepEqual(readNumber("year", "2027", NOW), { ok: true, value: 2027 });
  for (const typed of ["2028", "1899", "Old", "14", "2014.5"]) {
    assert.deepEqual(readNumber("year", typed, NOW), { ok: false, message: "Enter a year, like 2014." }, typed);
  }
});

test("readNumber decimal: baths are 1, 1.5, 2.5", () => {
  assert.deepEqual(readNumber("decimal", "1.5", NOW), { ok: true, value: 1.5 });
  assert.deepEqual(readNumber("decimal", "2", NOW), { ok: true, value: 2 });
  assert.deepEqual(readNumber("decimal", "one and a half", NOW), { ok: false, message: "Enter a number, like 1.5." });
});

test("savesAs: money shows how it will save when that differs from what was typed", () => {
  assert.equal(savesAs("money", "425k"), "Saves as $425,000");
  assert.equal(savesAs("money", "425000"), "Saves as $425,000");
  assert.equal(savesAs("money", "1.2m"), "Saves as $1,200,000");
  assert.equal(savesAs("money", "1842.5"), "Saves as $1,842.5");
  // Already reads that way, blank, or not a number: no preview.
  assert.equal(savesAs("money", "425,000"), null);
  assert.equal(savesAs("money", "$425,000"), null);
  assert.equal(savesAs("money", ""), null);
  assert.equal(savesAs("money", "low 400s"), null);
  // Rates and counts read as typed.
  assert.equal(savesAs("percent", "6.875%"), null);
  assert.equal(savesAs("integer", "2k"), null);
});

test("savesAs: a deal price that isn't one number is kept as text", () => {
  assert.equal(savesAs("money", "low 400s", { allowText: true }), "Kept as text, no amount");
  assert.equal(savesAs("money", "425k", { allowText: true }), "Saves as $425,000");
  assert.equal(savesAs("money", "   ", { allowText: true }), null);
});
