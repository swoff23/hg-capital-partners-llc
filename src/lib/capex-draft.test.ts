import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAPEX_RULES } from "./property-types";
import {
  capexChangeCount,
  capexProblems,
  cellErrorProps,
  changesLine,
  changesShort,
  leftProblems,
  rowLineId,
  toDraft,
  toPayload,
  type CapexDraft,
} from "./capex-draft";

const saved = toDraft(DEFAULT_CAPEX_RULES);
const edit = (fn: (d: CapexDraft) => void): CapexDraft => {
  const d = structuredClone(saved);
  fn(d);
  return d;
};

test("the saved rules become a draft of typed text with a uid per row", () => {
  assert.equal(saved.equipment.length, DEFAULT_CAPEX_RULES.equipment.length);
  assert.deepEqual(saved.equipment[1], { uid: "e1", type: "Furnace", monitor: "12", replace: "17", cost: "6,000" });
  assert.equal(saved.building[0].key, "roof");
  assert.equal(saved.building[0].cost, "25,000");
  assert.equal(capexChangeCount(saved, saved), 0);
});

test("the bar counts rules added, deleted and edited, a row once however many cells", () => {
  assert.equal(capexChangeCount(saved, edit((d) => void (d.equipment[1].replace = "18"))), 1);
  assert.equal(
    capexChangeCount(saved, edit((d) => {
      d.equipment[1].replace = "18";
      d.equipment[1].monitor = "11";
      d.equipment[1].cost = "6500";
    })),
    1,
  );
  assert.equal(capexChangeCount(saved, edit((d) => void d.equipment.splice(0, 1))), 1);
  assert.equal(capexChangeCount(saved, edit((d) => void d.building.push({ uid: "n1", key: null, label: "Fence", monitor: "0", replace: "0", cost: "0" }))), 1);
  assert.equal(
    capexChangeCount(saved, edit((d) => {
      d.equipment[0].cost = "21000";
      d.equipment.splice(2, 1);
      d.building[3].label = "Main Plumbing";
    })),
    3,
  );
});

test("a figure typed and changed back is no change; formatting alone isn't one", () => {
  assert.equal(capexChangeCount(saved, edit((d) => void (d.equipment[1].replace = "17"))), 0);
  assert.equal(capexChangeCount(saved, edit((d) => void (d.equipment[1].cost = "6000"))), 0);
  assert.equal(capexChangeCount(saved, edit((d) => void (d.equipment[1].type = "Furnace "))), 0);
});

test("the bar's words", () => {
  assert.equal(changesLine(3), "3 unsaved changes");
  assert.equal(changesLine(1), "1 unsaved change");
  assert.equal(changesShort(3), "3 changes");
  assert.equal(changesShort(1), "1 change");
});

test("the defaults have nothing wrong with them", () => {
  assert.deepEqual(capexProblems(saved), {});
});

test("each cell says what to enter, keyed as the server keys it", () => {
  const bad = edit((d) => {
    d.equipment[1].replace = "ten";
    d.equipment[2].monitor = "";
    d.equipment[3].cost = "lots";
    d.building[0].label = " ";
    d.building[1].replace = "2";
    d.building[1].monitor = "20";
    d.building[2].cost = "-5";
  });
  const p = capexProblems(bad);
  assert.equal(p["equipment.1.replace"], "Enter a whole number of years.");
  assert.equal(p["equipment.2.monitor"], "Enter a whole number of years.");
  assert.equal(p["equipment.3.cost"], "Enter an amount, like 6,000.");
  assert.equal(p["building.0.label"], "Name this system.");
  assert.equal(p["building.1.replace"], "Replace comes after Monitor.");
  assert.equal(p["building.2.defaultCost"], "Enter an amount up to 10,000,000.");
  assert.equal(Object.keys(p).length, 6);
});

test("replace may equal monitor but not come before it; a half-typed pair says nothing about order", () => {
  assert.deepEqual(capexProblems(edit((d) => void (d.equipment[0].replace = d.equipment[0].monitor))), {});
  assert.equal(capexProblems(edit((d) => void (d.equipment[0].replace = "14")))["equipment.0.replace"], "Replace comes after Monitor.");
  // Replace isn't a number yet: the one line is about that, not about the order.
  assert.equal(capexProblems(edit((d) => void (d.equipment[0].replace = "")))["equipment.0.replace"], "Enter a whole number of years.");
});

test("a name used twice is said on the second", () => {
  const dup = edit((d) => {
    d.equipment[2].type = "furnace";
    d.building[1].label = "ROOF";
  });
  const p = capexProblems(dup);
  assert.equal(p["equipment.2.type"], "furnace is already listed.");
  assert.equal(p["building.1.label"], "ROOF is already listed.");
});

test("the list can't be emptied, and a blank system never reaches the properties", () => {
  assert.equal(capexProblems(edit((d) => void (d.equipment.length = 0)))["equipment"], "Keep at least one equipment rule.");
  assert.equal(capexProblems(edit((d) => void (d.building.length = 0)))["building"], "Keep at least one building system.");
  // A new system named but left at zero years is still a valid rule the person chose; one with no name is not.
  const fresh = edit((d) => void d.building.push({ uid: "n1", key: null, label: "", monitor: "0", replace: "0", cost: "0" }));
  assert.equal(capexProblems(fresh)["building.10.label"], "Name this system.");
});

test("the payload carries numbers, and the text itself when a figure isn't one", () => {
  const draft = edit((d) => {
    d.equipment[0].cost = "20,000";
    d.equipment[1].monitor = "soon";
    d.building[0].label = "  Roof  ";
    d.building.push({ uid: "n1", key: null, label: "Fence", monitor: "5", replace: "10", cost: "$2k" });
  });
  const p = toPayload(draft);
  assert.equal(p.equipment[0].cost, 20000);
  assert.equal(p.equipment[1].monitor, "soon");
  assert.equal(p.building[0].label, "Roof");
  assert.deepEqual(p.building[10], { key: null, label: "Fence", monitor: 5, replace: 10, defaultCost: 2000 });
});

test("leaving a figure that holds text it can't read says so before Save; nothing else does", () => {
  const bad = edit((d) => {
    d.equipment[1].replace = "ten";
    d.equipment[2].monitor = "";
    d.building[0].label = " ";
    d.building[2].cost = "-5";
  });
  const uid = (i: number) => bad.equipment[i].uid;
  // Nothing has been left yet.
  assert.deepEqual(leftProblems(bad, new Set()), {});
  // Left, with text: the line shows. Left, but blank: it waits for Save. A name never shows here.
  const left = new Set([`${uid(1)}:replace`, `${uid(2)}:monitor`, `${bad.building[2].uid}:cost`, `${bad.building[0].uid}:cost`]);
  assert.deepEqual(leftProblems(bad, left), {
    "equipment.1.replace": "Enter a whole number of years.",
    "building.2.defaultCost": "Enter an amount up to 10,000,000.",
  });
  // A figure typed over and right again has no line.
  const fixed = edit((d) => void (d.equipment[1].replace = "12"));
  assert.deepEqual(leftProblems(fixed, new Set([`${uid(1)}:replace`])), {});
});

test("an invalid figure points to its row's error line, so a screen reader reads the problem", () => {
  // The field had aria-invalid, but its aria-describedby named only the "yrs" suffix.
  const line = rowLineId("e1");
  assert.equal(line, "capex-row-e1-line");
  assert.deepEqual(cellErrorProps("Enter 0 or more.", line), { "aria-invalid": true, "aria-describedby": line });
  // No line on screen yet: invalid, with nothing to point to.
  assert.deepEqual(cellErrorProps("Enter 0 or more.", undefined), { "aria-invalid": true });
  assert.deepEqual(cellErrorProps(undefined, line), {});
});
