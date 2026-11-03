import test from "node:test";
import assert from "node:assert/strict";
import { footedEquity, isSold, leftOutLine, loanPosition, portfolioPosition, type PositionProperty } from "./figures";

test("loanPosition: equity and LTV from value and balance", () => {
  assert.deepEqual(loanPosition("550000", "292890"), { equity: 257110, ltv: "53.3%" });
  // Equity from the whole dollars shown: $200,001 less $150,000.
  assert.deepEqual(loanPosition("200000.50", "150000.25"), { equity: 50001, ltv: "75.0%" });
  // Paid off, and under water.
  assert.deepEqual(loanPosition("300000", "0"), { equity: 300000, ltv: "0.0%" });
  assert.deepEqual(loanPosition("250000", "275000"), { equity: -25000, ltv: "110.0%" });
});

test("loanPosition: 15 Oxford's three figures foot as shown", () => {
  // Value $428,000, Loan balance $257,144 (stored 257,143.50): Equity reads $170,856, not $170,857.
  const { equity } = loanPosition("428000.00", "257143.50");
  assert.equal(equity, 170_856);
  assert.equal(Math.round(428_000) - Math.round(257_143.5), equity);
});

test("loanPosition: nothing to show without both figures", () => {
  assert.deepEqual(loanPosition(null, "292890"), { equity: null, ltv: null });
  assert.deepEqual(loanPosition("550000", null), { equity: null, ltv: null });
  assert.deepEqual(loanPosition(null, null), { equity: null, ltv: null });
  // No value to divide by: equity reads, LTV doesn't.
  assert.deepEqual(loanPosition("0", "1000"), { equity: -1000, ltv: null });
});

test("footedEquity: the shown figures subtract exactly", () => {
  for (const [v, b] of [
    [428_000, 257_143.5],
    [4_423_000, 2_865_984.95],
    [100.4, 200.6],
    [0, 0],
  ]) {
    assert.equal(footedEquity(v, b), Math.round(v) - Math.round(b));
  }
});

const P = (over: Partial<PositionProperty>): PositionProperty => ({ status: "Refinanced", value: null, balance: null, ...over });

test("portfolioPosition: all four over the properties with a value, so they reconcile", () => {
  const noValue = P({ value: null, balance: 100_000 });
  const props = [
    P({ value: 430_000, balance: 321_603.45 }),
    P({ value: 428_000, balance: 257_143.5 }),
    // No value on file: out of all four, and named so the strip can say so.
    noValue,
    // Neither figure: nothing to leave out.
    P({ value: null, balance: null }),
    // Sold: out of every figure, and never named.
    P({ status: "Sold", value: null, balance: 50_000 }),
    P({ status: "Sold", value: 900_000, balance: 0 }),
  ];
  const pos = portfolioPosition(props);
  assert.equal(pos.value, 858_000);
  // 321,603.45 + 257,143.50, without the unvalued property's 100,000.
  assert.equal(pos.loan, 578_746.95);
  // $858,000 less $578,747 as shown.
  assert.equal(pos.equity, 279_253);
  assert.equal(Math.round(pos.value) - Math.round(pos.loan), pos.equity);
  // 578,746.95 / 858,000 = 67.45%
  assert.equal(pos.ltv, "67.5%");
  assert.deepEqual(pos.leftOut, [noValue]);
});

test("portfolioPosition: the tester's case, a Hold property with a $300,000 loan and no value", () => {
  const values = [430_000, 428_000, 280_000, 850_000, 280_000, 550_000, 290_000, 450_000, 275_000, 275_000, 315_000];
  const loans = [321_603.45, 257_143.5, 178_569, 495_473, 163_700, 389_415, 210_000, 341_000, 146_445, 146_445, 216_191];
  const props = [...values.map((value, i) => P({ value, balance: loans[i] })), P({ status: "Hold", value: null, balance: 300_000 })];
  const pos = portfolioPosition(props);
  // Before, Loan balance read $3,165,985 beside Equity $1,557,015: Value less Loan didn't come to Equity.
  assert.equal(pos.value, 4_423_000);
  assert.equal(pos.loan, 2_865_984.95);
  assert.equal(pos.equity, 1_557_015);
  assert.equal(Math.round(pos.value) - Math.round(pos.loan), pos.equity);
  // 2,865,984.95 / 4,423,000 = 64.797%
  assert.equal(pos.ltv, "64.8%");
  assert.equal(pos.leftOut.length, 1);
});

test("portfolioPosition: nothing valued has no equity or LTV", () => {
  assert.deepEqual(portfolioPosition([P({ balance: 5 })]), { value: 0, loan: 0, equity: null, ltv: null, leftOut: [P({ balance: 5 })] });
  assert.deepEqual(portfolioPosition([]), { value: 0, loan: 0, equity: null, ltv: null, leftOut: [] });
});

test("leftOutLine: names one property, counts several, says nothing for none", () => {
  const read = (w: { before: string; link: string | null; after: string }) => `${w.before}${w.link ?? ""}${w.after}`;
  assert.equal(leftOutLine([]), null);
  const one = leftOutLine(["765 Prospect Avenue"])!;
  assert.equal(read(one.wide), "Leaves out 765 Prospect Avenue, which has no value.");
  // At 320 the named line cut off at "which has n..."; a phone counts instead.
  assert.equal(read(one.phone), "Leaves out 1 property with no value.");
  assert.ok(read(one.phone).length <= 40);
  const two = leftOutLine(["15 Oxford Ave", "23 Sherwood St"])!;
  assert.equal(read(two.wide), "Leaves out 2 properties with no value.");
  assert.deepEqual(two.phone, two.wide);
  for (const w of [one.wide, one.phone, two.wide]) assert.ok(!read(w).includes("—"));
});

test("isSold reads the stored status", () => {
  assert.equal(isSold("Sold"), true);
  assert.equal(isSold(" sold "), true);
  assert.equal(isSold("Stabilized"), false);
  assert.equal(isSold(null), false);
});
