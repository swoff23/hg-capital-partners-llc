import test from "node:test";
import assert from "node:assert/strict";
import { capRows, niceTop, shareBase, shareLabel, tickLabel } from "./chart-scale";

test("niceTop: 1, 2, 2.5 or 5 times a power of ten, at or above the largest value", () => {
  assert.equal(niceTop(4_210), 5_000);
  assert.equal(niceTop(12_400), 20_000);
  assert.equal(niceTop(2_100), 2_500);
  assert.equal(niceTop(2_500), 2_500);
  assert.equal(niceTop(2_501), 5_000);
  assert.equal(niceTop(5_001), 10_000);
  assert.equal(niceTop(1_000), 1_000);
  assert.equal(niceTop(1_001), 2_000);
  assert.equal(niceTop(999), 1_000);
  assert.equal(niceTop(1_480.57), 2_000);
  assert.equal(niceTop(0.4), 0.5);
  assert.equal(niceTop(250_000), 250_000);
  assert.equal(niceTop(260_000), 500_000);
});

test("niceTop: nothing above zero has no tick", () => {
  assert.equal(niceTop(0), 0);
  assert.equal(niceTop(-300), 0);
  assert.equal(niceTop(Number.NaN), 0);
});

test("tickLabel: compact dollars with a true minus", () => {
  assert.equal(tickLabel(5_000), "$5k");
  assert.equal(tickLabel(2_500), "$2.5k");
  assert.equal(tickLabel(250_000), "$250k");
  assert.equal(tickLabel(1_000_000), "$1M");
  assert.equal(tickLabel(2_500_000), "$2.5M");
  assert.equal(tickLabel(500), "$500");
  assert.equal(tickLabel(-5_000), "−$5k");
  assert.equal(tickLabel(0), "$0");
});

test("shareLabel: whole percents, a sliver, and no share for a refund", () => {
  assert.equal(shareLabel(18_970, 61_200), "31%");
  assert.equal(shareLabel(61_200, 61_200), "100%");
  assert.equal(shareLabel(300, 61_200), "<1%");
  assert.equal(shareLabel(-120, 61_200), null);
  assert.equal(shareLabel(0, 61_200), null);
  assert.equal(shareLabel(100, 0), null);
  assert.equal(shareLabel(100, -50), null);
});

test("capRows: top 7, the rest summed", () => {
  const rows = [90, 80, 70, 60, 50, 40, 30, 20, 10, -5].map((cents, i) => ({ key: `r${i}`, cents }));
  const { shown, rest } = capRows(rows);
  assert.deepEqual(shown.map((r) => r.cents), [90, 80, 70, 60, 50, 40, 30]);
  // 20 + 10 - 5
  assert.equal(rest?.cents, 25);
  assert.equal(rest?.rows.length, 3);
});

test("capRows: eight rows or fewer all show", () => {
  const eight = [8, 7, 6, 5, 4, 3, 2, 1].map((cents) => ({ cents }));
  assert.deepEqual(capRows(eight), { shown: eight, rest: null });
  assert.deepEqual(capRows([]), { shown: [], rest: null });
});

test("shareBase: refunds stay out, so shares never add past 100%", () => {
  assert.equal(shareBase([100_000, 50_000, -20_000]), 150_000);
  assert.equal(shareBase([]), 0);
  // Repairs against the net ($800) would read 125%; against the spend it reads 100%.
  const rows = [100_000, -20_000];
  assert.equal(shareLabel(100_000, shareBase(rows)), "100%");
});
