import assert from "node:assert/strict";
import { test } from "node:test";
import { unitSlots } from "./unit-slots";

test("units saved before ids existed get their place in the list as the id", () => {
  assert.deepEqual(unitSlots([{ label: "Lower" }, { label: "Upper" }]), [
    { unitId: "unit-at-0", label: "Lower" },
    { unitId: "unit-at-1", label: "Upper" },
  ]);
});

test("a stored id is kept, and a property with no units is one Home row", () => {
  assert.deepEqual(unitSlots([{ id: "abc", label: "Front" }, { label: "Rear" }]), [
    { unitId: "abc", label: "Front" },
    { unitId: "unit-at-1", label: "Rear" },
  ]);
  assert.deepEqual(unitSlots([]), [{ unitId: null, label: "Home" }]);
  assert.deepEqual(unitSlots(null), [{ unitId: null, label: "Home" }]);
});
