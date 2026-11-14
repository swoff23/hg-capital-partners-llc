import test from "node:test";
import assert from "node:assert/strict";
import { ENTITY_NAMES } from "../quickbooks/entities";
import { ENTITY_MESSAGE, entityProblem } from "./entity";

test("ENTITY_NAMES: the five companies in their QuickBooks order", () => {
  assert.deepEqual(ENTITY_NAMES, [
    "HG Capital Partners LLC",
    "HG Buffalo Holding 1 LLC",
    "HG Buffalo Holding 2 LLC",
    "HG Buffalo Property Management LLC",
    "BMK Property Group LLC",
  ]);
});

test("entityProblem: takes any of the companies", () => {
  for (const name of ENTITY_NAMES) assert.equal(entityProblem(name, null), null);
});

test("entityProblem: takes empty, which clears the entity", () => {
  assert.equal(entityProblem(null, "HG Capital Partners LLC"), null);
  assert.equal(entityProblem("  ", "HG Capital Partners LLC"), null);
});

test("entityProblem: refuses a name that isn't on the list", () => {
  assert.equal(entityProblem("HG Buffalo Holding 3 LLC", "HG Capital Partners LLC"), ENTITY_MESSAGE);
  assert.equal(entityProblem("hg capital partners llc", null), ENTITY_MESSAGE);
});

test("entityProblem: keeps a value stored before the list, unchanged", () => {
  const old = "1) 50% BK \n2) 50% HG Buffalo Holding 1 LLC";
  assert.equal(entityProblem(old, old), null);
  assert.equal(entityProblem("Something new", old), ENTITY_MESSAGE);
});
