import test from "node:test";
import assert from "node:assert/strict";
import type { UnitEquipment } from "@/lib/property-types";
import {
  EQUIPMENT_FOOTER,
  EQUIPMENT_YEAR_MESSAGE,
  equipmentProblems,
  firstEquipmentProblem,
  sheetUnitAt,
  stillFailing,
  unitSheetWords,
} from "./unit-sheet";

test("unitSheetWords: the leave question never changes while the name is typed", () => {
  // Built from the typed name, the hold it names was re-set on every keystroke (React error #185 on a long name).
  const words = ["U", "Un", "Unit 2A", "A".repeat(100)].map((label) => unitSheetWords(false, "Unit 2", label).leaveTitle);
  assert.deepEqual(new Set(words), new Set(["Leave Unit 2?"]));
  assert.deepEqual(new Set(["", "Unit 9"].map((label) => unitSheetWords(true, "New unit", label).leaveTitle)), new Set(["Leave the new unit?"]));
  // The discard question shows only when asked, so it names the unit as it now reads.
  assert.equal(unitSheetWords(false, "Unit 2", "Unit 2A").discardTitle, "Discard changes to Unit 2A?");
  assert.equal(unitSheetWords(true, "New unit", "Unit 9").discardTitle, "Discard the new unit?");
});

test("sheetUnitAt: the sheet's unit by id, after someone else's save gave the list lasting ids", () => {
  const before = [
    { id: "unit-at-0", label: "Lower" },
    { id: "unit-at-1", label: "Upper" },
  ];
  // The other tab's save swapped the placeholders for lasting ids. Looked up by the placeholder alone,
  // "Load the latest" fell back to the stale copy, and Save added a second "Upper".
  const after = [
    { id: "2072f376", label: "Lower" },
    { id: "d5b4296e", label: "Upper" },
  ];
  assert.equal(sheetUnitAt(after, { unitId: "unit-at-1", at: 1, label: "Upper" }), 1);
  assert.equal(sheetUnitAt(before, { unitId: "unit-at-1", at: 1, label: "Upper" }), 1);
  // A lasting id is found wherever it moved to, and only by itself.
  const moved = [{ id: "fd75e161", label: "Attic" }, ...after];
  assert.equal(sheetUnitAt(moved, { unitId: "d5b4296e", at: 1, label: "Upper" }), 2);
  assert.equal(sheetUnitAt(after, { unitId: "gone-id", at: 1, label: "Upper" }), -1);
  // A placeholder whose place now holds another unit (one was deleted ahead of it) finds nothing: no Delete lands on a neighbour.
  assert.equal(sheetUnitAt([{ id: "d5b4296e", label: "Upper" }], { unitId: "unit-at-0", at: 0, label: "Lower" }), -1);
  assert.equal(sheetUnitAt(after, { unitId: "unit-at-5", at: 5, label: "Upper" }), -1);
  // A new unit's sheet has no unit to find.
  assert.equal(sheetUnitAt(after, { unitId: null, at: null, label: null }), -1);
});

const E = (over: Partial<UnitEquipment>): UnitEquipment => ({ type: "", model: "", installYear: "", comment: "", ...over });

test("equipmentProblems: a used row needs a type, and a typed year must read", () => {
  const stored = new Map([[1, "~2004"]]);
  const rows = [E({ type: "HVAC", installYear: "3000" }), E({ type: "Water Heater", installYear: "~2004" }), E({ model: "QA-MODEL" }), E({})];
  assert.deepEqual(equipmentProblems(rows, stored), {
    0: { year: EQUIPMENT_YEAR_MESSAGE },
    2: { type: "Choose a type." },
  });
  assert.deepEqual(equipmentProblems([E({ type: "HVAC", installYear: "2014" })], new Map()), {});
});

test("stillFailing: a fixed year clears as it's typed, and nothing new turns red before Save", () => {
  const shown = { 0: { year: EQUIPMENT_YEAR_MESSAGE } };
  // The tester's Year 3000, then 2027: the line used to stay until the next Save.
  const fixed = equipmentProblems([E({ type: "HVAC", installYear: "2027" })], new Map());
  assert.deepEqual(stillFailing(shown, fixed), {});
  // Still wrong: the line stays.
  const still = equipmentProblems([E({ type: "HVAC", installYear: "30000" })], new Map());
  assert.deepEqual(stillFailing(shown, still), shown);
  // A new problem in another row waits for Save.
  const other = equipmentProblems([E({ type: "HVAC", installYear: "2027" }), E({ model: "X" })], new Map());
  assert.deepEqual(stillFailing(shown, other), {});
});

test("the lines: the year fits the table's Year column, and the footer points up at the rows", () => {
  assert.ok(EQUIPMENT_YEAR_MESSAGE.length <= 13, EQUIPMENT_YEAR_MESSAGE);
  // The footer sits under the equipment in every layout; it said "below".
  assert.equal(EQUIPMENT_FOOTER, "Check the equipment above.");
  assert.equal(firstEquipmentProblem({ 2: { type: "Choose a type." } }), "Choose a type.");
  assert.equal(firstEquipmentProblem(null), undefined);
});
