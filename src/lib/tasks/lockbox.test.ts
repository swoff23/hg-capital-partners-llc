import test from "node:test";
import assert from "node:assert/strict";
import { lockboxState, resolveLockboxCode } from "./lockbox";

const units = [
  { label: "1", lockboxCode: "1234" },
  { label: "2", lockboxCode: " 5678 " },
  { label: "3", lockboxCode: "" },
];

test("a job with a unit shows that unit's code, matched by label", () => {
  assert.equal(resolveLockboxCode(units, "2"), "5678");
  assert.equal(resolveLockboxCode(units, " 1 "), "1234");
  assert.equal(lockboxState(units, "2"), "shown");
});

test("a unit with no code shows nothing", () => {
  assert.equal(resolveLockboxCode(units, "3"), null);
  assert.equal(lockboxState(units, "3"), "none");
  assert.equal(lockboxState(units, "9"), "none");
});

test("no unit: the code shows only when the property has exactly one", () => {
  assert.equal(resolveLockboxCode([{ label: "A", lockboxCode: "42" }, { label: "B" }], null), "42");
  assert.equal(resolveLockboxCode(units, null), null);
  assert.equal(lockboxState(units, null), "pick-unit");
  assert.equal(lockboxState(units, ""), "pick-unit");
});

test("a property with no codes has nothing to show", () => {
  assert.equal(lockboxState([{ label: "1" }], null), "none");
  assert.equal(lockboxState([], null), "none");
});

test("labels match case-insensitively", () => {
  assert.equal(resolveLockboxCode([{ label: "Upper", lockboxCode: "77" }], "upper"), "77");
});
