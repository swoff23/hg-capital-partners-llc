import test from "node:test";
import assert from "node:assert/strict";
import { loanPosition } from "./figures";

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
