import test from "node:test";
import assert from "node:assert/strict";
import type { DataQualityReport } from "./data-quality";
import { needsReview, reviewFlags } from "./review";

function report(over: Partial<DataQualityReport> = {}): DataQualityReport {
  return {
    basis: "CASH",
    unclassed: { lineCount: 0, inCents: 0, outCents: 0 },
    ignored: { lineCount: 0, inCents: 0, outCents: 0 },
    suspenseCents: 0,
    uncategorizedCents: 0,
    negativeReclass: { grossCents: 0, lineCount: 0 },
    ownerFundedCents: 0,
    subsidyCents: 0,
    unmappedPropertyLikeClasses: [],
    cashVsAccrualNetIncomeDeltaCents: 0,
    ...over,
  };
}

test("a clean report needs nothing", () => {
  assert.deepEqual(needsReview(report()), []);
  assert.deepEqual(Object.values(reviewFlags(report())), [false, false, false, false, false, false]);
  assert.deepEqual(needsReview(null), []);
});

test("cash and accrual differ by timing, so a big difference is never flagged", () => {
  const dq = report({ cashVsAccrualNetIncomeDeltaCents: -354_658 });
  assert.deepEqual(needsReview(dq), []);
  assert.equal(Object.values(reviewFlags(dq)).some(Boolean), false);
});

test("unclassified lines: more than 3, or over $500 in and out together", () => {
  assert.equal(reviewFlags(report({ unclassed: { lineCount: 3, inCents: 20_000, outCents: 30_000 } })).unclassed, false);
  assert.equal(reviewFlags(report({ unclassed: { lineCount: 4, inCents: 0, outCents: 100 } })).unclassed, true);
  assert.equal(reviewFlags(report({ unclassed: { lineCount: 1, inCents: 20_000, outCents: 30_001 } })).unclassed, true);
  // Out is counted at its size whatever its sign.
  assert.equal(reviewFlags(report({ unclassed: { lineCount: 2, inCents: 0, outCents: -50_001 } })).unclassed, true);
});

test("needsReview: the Overview line names unclassified lines and suspense, in that order", () => {
  const dq = report({ unclassed: { lineCount: 14, inCents: 1_000, outCents: 2_000 }, suspenseCents: 31_000, uncategorizedCents: 500 });
  assert.deepEqual(needsReview(dq), [
    { key: "unclassed", lines: 14 },
    { key: "suspense", cents: 31_000 },
  ]);
  // $0 in suspense isn't a problem.
  assert.deepEqual(needsReview(report({ suspenseCents: 0 })), []);
  assert.deepEqual(needsReview(report({ suspenseCents: -1 })), [{ key: "suspense", cents: -1 }]);
});

test("the Settings flags: uncategorized, negative reclasses over 5, owner-funded rent, property-like classes", () => {
  const flags = reviewFlags(
    report({
      uncategorizedCents: 1,
      negativeReclass: { grossCents: -900, lineCount: 6 },
      ownerFundedCents: 50_000,
      unmappedPropertyLikeClasses: [{ qboId: "7", fullyQualifiedName: "HGC:118 Congress" }],
    }),
  );
  assert.deepEqual(flags, {
    unclassed: false,
    suspense: false,
    uncategorized: true,
    negativeReclass: true,
    ownerFunded: true,
    propertyLikeClasses: true,
  });
  assert.equal(reviewFlags(report({ negativeReclass: { grossCents: -900, lineCount: 5 } })).negativeReclass, false);
});
