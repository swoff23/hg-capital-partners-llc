import test from "node:test";
import assert from "node:assert/strict";
import { countUnitRefs, removeUnitQuestion, unitRefKey } from "./unit-refs";

test("open tasks and listings are counted per unit, matched as the rename sync matches them", () => {
  const refs = countUnitRefs(
    [{ unitLabel: "Rear" }, { unitLabel: " rear " }, { unitLabel: "Upper" }, { unitLabel: null }, { unitLabel: "  " }],
    [{ unitLabel: "REAR" }, { unitLabel: "Lower" }],
  );
  assert.deepEqual(refs, {
    rear: { tasks: 2, listings: 1 },
    upper: { tasks: 1, listings: 0 },
    lower: { tasks: 0, listings: 1 },
  });
  assert.equal(unitRefKey(" Rear "), "rear");
  assert.equal(unitRefKey(null), "");
});

test("the question names what points at the unit (decision 19)", () => {
  assert.deepEqual(removeUnitQuestion("Rear", { tasks: 1, listings: 1 }), {
    title: "Remove Rear?",
    body: "It has an open task and a listing.",
  });
  assert.deepEqual(removeUnitQuestion("Rear", { tasks: 3, listings: 0 }), { title: "Remove Rear?", body: "It has 3 open tasks." });
  assert.deepEqual(removeUnitQuestion(" Upper ", { tasks: 0, listings: 2 }), { title: "Remove Upper?", body: "It has 2 listings." });
  assert.equal(removeUnitQuestion("Rear", { tasks: 0, listings: 0 }), null);
  assert.equal(removeUnitQuestion("Rear", undefined), null);
});
