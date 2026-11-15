import test from "node:test";
import assert from "node:assert/strict";
import { foldedKeys, moreFieldsLabel } from "./rail-fold";

const none = new Set<string>();

test("foldedKeys: folds empty rows and keeps filled ones, in order", () => {
  const rows = [
    { key: "currentLoan", empty: false },
    { key: "lender", empty: true },
    { key: "loanServicer", empty: false },
    { key: "loanRate", empty: true },
  ];
  assert.deepEqual(foldedKeys(rows, none), ["lender", "loanRate"]);
});

test("foldedKeys: never folds a kept row, even empty (a reminder date, a switch)", () => {
  const rows = [
    { key: "loanMaturityDate", empty: true, keep: true },
    { key: "loanEscrow", empty: false, keep: true },
    { key: "lender", empty: true },
  ];
  assert.deepEqual(foldedKeys(rows, none), ["lender"]);
});

test("foldedKeys: a row seen filled on this visit stays out after it's cleared", () => {
  const rows = [
    { key: "lender", empty: true },
    { key: "loanRate", empty: true },
  ];
  assert.deepEqual(foldedKeys(rows, new Set(["lender"])), ["loanRate"]);
});

test("foldedKeys: a fold row always folds, filled, seen filled or empty", () => {
  const rows = [
    { key: "value", empty: false, keep: true },
    { key: "attorney", empty: false, fold: true },
    { key: "status", empty: true, fold: true },
    { key: "loanServicer", empty: false, fold: true },
  ];
  assert.deepEqual(foldedKeys(rows, new Set(["attorney", "loanServicer"])), ["attorney", "status", "loanServicer"]);
});

test("foldedKeys: nothing folds when every row has a value", () => {
  assert.deepEqual(foldedKeys([{ key: "value", empty: false }], none), []);
});

test("moreFieldsLabel: one line, singular for one", () => {
  assert.equal(moreFieldsLabel(7), "7 more fields");
  assert.equal(moreFieldsLabel(1), "1 more field");
});

test("foldedKeys: a missing required row never folds, even one that always would", () => {
  const rows = [
    { key: "insuranceCarrier", empty: true, fold: true, missing: true },
    { key: "insurancePolicyNo", empty: false, fold: true },
    { key: "insuranceCoverage", empty: true, missing: false },
  ];
  assert.deepEqual(foldedKeys(rows, none), ["insurancePolicyNo", "insuranceCoverage"]);
});
