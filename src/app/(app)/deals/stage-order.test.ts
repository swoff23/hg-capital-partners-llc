import { test } from "node:test";
import assert from "node:assert/strict";
import { firstByStage, sortByStatus } from "./stage-order";

const at = (d: number) => new Date(Date.UTC(2026, 9, d));
const keys = [
  { id: "pass-new", status: "Pass", updatedAt: at(20) },
  { id: "legacy", status: "Active", updatedAt: at(25) },
  { id: "holding", status: "6 - Holding", updatedAt: at(10) },
  { id: "high-old", status: "1 - High", updatedAt: at(1) },
  { id: "closed", status: "CLOSED!", updatedAt: at(5) },
  { id: "high-new", status: "1 - High", updatedAt: at(9) },
  { id: "pass-old", status: "Pass", updatedAt: at(2) },
];

test("Stage order is the pipeline, newest first within a stage, and an unknown stage last", () => {
  assert.deepEqual(
    sortByStatus(keys, false).map((k) => k.id),
    ["high-new", "high-old", "holding", "closed", "pass-new", "pass-old", "legacy"],
  );
  // Descending flips the stages and keeps newest first inside each.
  assert.deepEqual(
    sortByStatus(keys, true).map((k) => k.id),
    ["legacy", "pass-new", "pass-old", "closed", "holding", "high-new", "high-old"],
  );
});

test("the cap applies after the stage sort, so the shown rows are the pipeline's first", () => {
  assert.deepEqual(firstByStage(keys, false, 3), ["high-new", "high-old", "holding"]);
  assert.deepEqual(firstByStage(keys, true, 2), ["legacy", "pass-new"]);
  assert.deepEqual(firstByStage([], false, 300), []);
});
