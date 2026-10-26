import test from "node:test";
import assert from "node:assert/strict";
import { isSold, loanPosition, portfolioPosition, type PositionProperty } from "./figures";

test("loanPosition: equity and LTV from value and balance", () => {
  assert.deepEqual(loanPosition("550000", "292890"), { equity: 257110, ltv: "53.3%" });
  assert.deepEqual(loanPosition("200000.50", "150000.25"), { equity: 50000.25, ltv: "75.0%" });
  // Paid off, and under water.
  assert.deepEqual(loanPosition("300000", "0"), { equity: 300000, ltv: "0.0%" });
  assert.deepEqual(loanPosition("250000", "275000"), { equity: -25000, ltv: "110.0%" });
});

test("loanPosition: nothing to show without both figures", () => {
  assert.deepEqual(loanPosition(null, "292890"), { equity: null, ltv: null });
  assert.deepEqual(loanPosition("550000", null), { equity: null, ltv: null });
  assert.deepEqual(loanPosition(null, null), { equity: null, ltv: null });
  // No value to divide by: equity reads, LTV doesn't.
  assert.deepEqual(loanPosition("0", "1000"), { equity: -1000, ltv: null });
});

const P = (over: Partial<PositionProperty>): PositionProperty => ({ status: "Refinanced", value: null, balance: null, ...over });

test("portfolioPosition: value and balance summed; equity and LTV over properties with a value", () => {
  const props = [
    P({ value: 430_000, balance: 321_603.45 }),
    P({ value: 428_000, balance: 257_143.5 }),
    // No value on file: its balance counts in Loan balance but not in equity or LTV.
    P({ value: null, balance: 100_000 }),
    // Sold: out of every figure.
    P({ status: "Sold", value: 900_000, balance: 0 }),
  ];
  assert.deepEqual(portfolioPosition(props), {
    value: 858_000,
    loan: 678_746.95,
    // 858,000 - 578,746.95
    equity: 279_253.05,
    // 578,746.95 / 858,000 = 67.45%
    ltv: "67.5%",
  });
});

test("portfolioPosition: the local import's eleven buildings", () => {
  const values = [430_000, 428_000, 280_000, 850_000, 280_000, 550_000, 290_000, 450_000, 275_000, 275_000, 315_000];
  const loans = [321_603.45, 257_143.5, 178_569, 495_473, 163_700, 389_415, 210_000, 341_000, 146_445, 146_445, 216_191];
  const pos = portfolioPosition(values.map((value, i) => P({ value, balance: loans[i] })));
  assert.equal(pos.value, 4_423_000);
  assert.equal(pos.loan, 2_865_984.95);
  assert.equal(pos.equity, 1_557_015.05);
  // 2,865,984.95 / 4,423,000 = 64.797%
  assert.equal(pos.ltv, "64.8%");
});

test("portfolioPosition: nothing valued has no equity or LTV", () => {
  assert.deepEqual(portfolioPosition([P({ balance: 5 })]), { value: 0, loan: 5, equity: null, ltv: null });
  assert.deepEqual(portfolioPosition([]), { value: 0, loan: 0, equity: null, ltv: null });
});

test("isSold reads the stored status", () => {
  assert.equal(isSold("Sold"), true);
  assert.equal(isSold(" sold "), true);
  assert.equal(isSold("Stabilized"), false);
  assert.equal(isSold(null), false);
});
