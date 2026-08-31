import test from "node:test";
import assert from "node:assert/strict";
import { classifyLine, type LineToClassify } from "./classify-line";

function rentLine(partial: Partial<LineToClassify>): LineToClassify {
  return {
    category: "RENT",
    treatment: "OPERATING_INCOME",
    classification: "Revenue",
    amountCents: 150000,
    name: null,
    memo: null,
    txnType: "Deposit",
    ...partial,
  };
}

test("owner P2P deposits booked to Rents are pulled out of NOI", () => {
  // real rows from the spike
  const a = classifyLine(
    rentLine({ name: "SCHWAB BANK", memo: "SCHWAB BANK  |  P2P |  CONNOR ANEIL SW", amountCents: 60000 }),
  );
  assert.deepEqual(a.lineTags, ["OWNER_FUNDED"]);
  assert.equal(a.treatment, "NON_OPERATING");

  const b = classifyLine(
    rentLine({ name: "CONNOR ANEIL SW", memo: "SCHWAB BANK  |  P2P |  CONNOR ANEIL SW", amountCents: 38500 }),
  );
  assert.deepEqual(b.lineTags, ["OWNER_FUNDED"]);
  assert.equal(b.treatment, "NON_OPERATING");
});

test("Section-8 / voucher rent stays operating income, tagged", () => {
  for (const memo of [
    "RENTAL ASSIS8801  |  HAP PYMT",
    "BUFFALO MUNICIPA  |  NY 002 HCV",
    "ERIE COUNTY PHA  |  HAP PMT",
  ]) {
    const c = classifyLine(rentLine({ name: memo.split("  |  ")[0], memo }));
    assert.deepEqual(c.lineTags, ["SUBSIDY"], memo);
    assert.equal(c.treatment, "OPERATING_INCOME", memo);
  }
});

test("a normal Baselane rent deposit gets no tags", () => {
  const c = classifyLine(rentLine({ name: "Baselane", memo: "Baselane  |  Rent#cLHBi" }));
  assert.deepEqual(c.lineTags, []);
  assert.equal(c.treatment, "OPERATING_INCOME");
});

test("internal transfer mis-booked to Rents is excluded", () => {
  const c = classifyLine(
    rentLine({ name: "Baselane (deleted)", memo: "HG Buffalo Property Management LLC  |  INTERNAL_TRANSFER" }),
  );
  assert.ok(c.lineTags.includes("INTERNAL_TRANSFER"));
  assert.equal(c.treatment, "EXCLUDED");
});

test("negative expense lines are flagged, not dropped or abs()'d", () => {
  const c = classifyLine({
    category: "OTHER_OPEX",
    treatment: "OPERATING_EXPENSE",
    classification: "Expense",
    amountCents: -2029506,
    name: "Reclass",
    memo: "move to Sale Proceeds",
    txnType: "Journal Entry",
  });
  assert.deepEqual(c.lineTags, ["NEGATIVE_RECLASS"]);
  assert.equal(c.treatment, "OPERATING_EXPENSE"); // still an opex line, just negative
});

test("non-rent income is untouched", () => {
  const c = classifyLine({
    category: "OTHER_INCOME",
    treatment: "NON_OPERATING",
    classification: "Revenue",
    amountCents: 2093,
    name: "Bank Interest Income",
    memo: "Interest May 2026",
    txnType: "Deposit",
  });
  assert.deepEqual(c.lineTags, []);
  assert.equal(c.treatment, "NON_OPERATING");
});
