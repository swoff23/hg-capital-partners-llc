import test from "node:test";
import assert from "node:assert/strict";
import { dueIn } from "./capex";

test("dueIn: a cost says its year only while that year is ahead", () => {
  // The tester's roof, installed 1990, due 2010: "$12,000" alone, beside its Replace status.
  assert.equal(dueIn(2010, 2026), null);
  assert.equal(dueIn(2026, 2026), "in 2026");
  assert.equal(dueIn(2032, 2026), "in 2032");
  assert.equal(dueIn(null, 2026), null);
  assert.equal(dueIn(undefined, 2026), null);
});
