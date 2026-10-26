import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MOVE_IN_FORM_SCHEMA, moveInChangeCount, moveInProblems, type MoveInFormSchema } from "./move-in-form-types";

const saved = DEFAULT_MOVE_IN_FORM_SCHEMA;
const edit = (fn: (d: MoveInFormSchema) => void): MoveInFormSchema => {
  const d = structuredClone(saved);
  fn(d);
  return d;
};

test("an untouched form has no changes", () => {
  assert.equal(moveInChangeCount(saved, structuredClone(saved)), 0);
});

test("each item added, deleted or renamed is one change, and a rename is not a delete and an add", () => {
  assert.equal(moveInChangeCount(saved, edit((d) => void (d.sections[0].items[0].label = "Upper cabinets"))), 1);
  assert.equal(moveInChangeCount(saved, edit((d) => void d.sections[0].items.splice(3, 1))), 1);
  assert.equal(moveInChangeCount(saved, edit((d) => void d.sections[1].items.push({ key: "item-1", label: "Fireplace" }))), 1);
  assert.equal(
    moveInChangeCount(saved, edit((d) => {
      d.sections[0].items[0].label = "Upper cabinets";
      d.sections[0].items.splice(3, 1);
      d.sections[1].items.push({ key: "item-1", label: "Fireplace" });
    })),
    3,
  );
});

test("Required and Max instances count when they move, and not when they come back", () => {
  assert.equal(moveInChangeCount(saved, edit((d) => void (d.sections[4].minCount = 1))), 1);
  assert.equal(moveInChangeCount(saved, edit((d) => void (d.sections[2].maxCount = 2))), 1);
  assert.equal(
    moveInChangeCount(saved, edit((d) => {
      d.sections[4].minCount = 1;
      d.sections[2].maxCount = 2;
    })),
    2,
  );
  assert.equal(moveInChangeCount(saved, edit((d) => void (d.sections[0].items[0].label = " Cabinets "))), 0);
});

test("an item with no name is the one thing that stops Save, said on that item", () => {
  assert.deepEqual(moveInProblems(saved), {});
  const blank = edit((d) => {
    d.sections[0].items[2].label = "   ";
    d.sections[3].items.push({ key: "item-9", label: "" });
  });
  assert.deepEqual(moveInProblems(blank), {
    "sections.0.items.2.label": "Name this item.",
    [`sections.3.items.${saved.sections[3].items.length}.label`]: "Name this item.",
  });
});
