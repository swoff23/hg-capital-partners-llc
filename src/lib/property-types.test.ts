import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAPEX_RULES,
  orphanedEquipmentTypes,
  parseCapexRules,
  capexForecast,
  isHouseMeterRow,
  propertyUnitCount,
  syncedUnitCount,
  reconcileUnits,
  renamedLabel,
  withUnitIds,
  type CapexRules,
} from "./property-types";

test("isHouseMeterRow: only the building's own meters, never a real unit", () => {
  assert.equal(isHouseMeterRow({ label: "HSE (house)" }), true);
  assert.equal(isHouseMeterRow({ label: "hse" }), true);
  assert.equal(isHouseMeterRow({ label: "Common (house)" }), true);
  for (const label of ["Rear house", "Front", "Unit 1", "1st Rear / Apt #3", "", null, undefined]) {
    assert.equal(isHouseMeterRow({ label }), false, String(label));
  }
});

test("syncedUnitCount: follows the records only while the stored count agrees with them", () => {
  const two = [{ label: "Lower" }, { label: "Upper" }];
  const three = [...two, { label: "Attic" }];
  assert.equal(syncedUnitCount(2, two, three), 3);
  assert.equal(syncedUnitCount(null, two, three), 3);
  assert.equal(syncedUnitCount(3, three, two), 2);
  assert.equal(syncedUnitCount(2, three, [...three, { label: "Rear" }]), undefined); // set on purpose (767)
  assert.equal(syncedUnitCount(2, two, [...two, { label: "HSE (house)" }]), undefined); // a meter isn't a unit
  assert.equal(syncedUnitCount(2, two, two), undefined);
  assert.equal(syncedUnitCount(1, [{ label: "Only" }], []), null);
});

test("propertyUnitCount: the stored count wins; else unit records less house meters", () => {
  const records = [{ label: "Lower" }, { label: "Upper" }, { label: "Attic" }, { label: "HSE (house)" }];
  assert.equal(propertyUnitCount({ unitCount: 3, units: records }), 3);
  assert.equal(propertyUnitCount({ unitCount: 2, units: [{ label: "A" }, { label: "B" }, { label: "C" }] }), 2);
  assert.equal(propertyUnitCount({ unitCount: null, units: records }), 3);
  assert.equal(propertyUnitCount({ unitCount: null, units: [{ label: "HSE (house)" }] }), null);
  assert.equal(propertyUnitCount({ unitCount: null, units: null }), null);
  assert.equal(propertyUnitCount({ unitCount: 0, units: records }), 0);
});

test("parseCapexRules: junk / empty input falls back to the full defaults", () => {
  for (const junk of [null, undefined, "x", 42, [], {}, { equipment: null, building: 0 }]) {
    assert.deepEqual(parseCapexRules(junk), DEFAULT_CAPEX_RULES);
  }
});

test("parseCapexRules: a valid blob round-trips", () => {
  const blob = {
    equipment: [{ type: "Roof", monitor: 12, replace: 18, cost: 21000 }],
    building: [{ key: "roof", label: "Roof", monitor: 10, replace: 16, defaultCost: 26000 }],
  };
  assert.deepEqual(parseCapexRules(blob), blob);
});

test("parseCapexRules: non-finite / non-numeric rows are dropped, never thrown", () => {
  const r = parseCapexRules({
    equipment: [
      { type: "Roof", monitor: "NaN", replace: 20, cost: 1000 },
      { type: "HVAC", monitor: 5, replace: Infinity, cost: 1000 },
      { type: "Oven", monitor: 5, replace: 9, cost: "abc" },
      { type: "Boiler", monitor: 5, replace: 9, cost: 1000 },
    ],
    building: [{ key: "roof", label: "Roof", monitor: 1, replace: 2, defaultCost: 3 }],
  });
  assert.deepEqual(
    r.equipment,
    [{ type: "Boiler", monitor: 5, replace: 9, cost: 1000 }],
  );
});

test("parseCapexRules: replace < monitor is clamped up; negatives clamp to 0", () => {
  const r = parseCapexRules({
    equipment: [{ type: "Roof", monitor: 20, replace: 10, cost: 1000 }],
    building: [{ key: "x", label: "X", monitor: -5, replace: -1, defaultCost: -9 }],
  });
  assert.deepEqual(r.equipment[0], { type: "Roof", monitor: 20, replace: 20, cost: 1000 });
  assert.deepEqual(r.building[0], { key: "x", label: "X", monitor: 0, replace: 0, defaultCost: 0 });
});

test("parseCapexRules: duplicate type / key de-dupes, last wins", () => {
  const r = parseCapexRules({
    equipment: [
      { type: "Roof", monitor: 1, replace: 1, cost: 1 },
      { type: "Roof", monitor: 9, replace: 9, cost: 9 },
    ],
    building: [
      { key: "roof", label: "A", monitor: 1, replace: 1, defaultCost: 1 },
      { key: "roof", label: "B", monitor: 2, replace: 2, defaultCost: 2 },
    ],
  });
  assert.equal(r.equipment.length, 1);
  assert.equal(r.equipment[0].cost, 9);
  assert.equal(r.building.length, 1);
  assert.equal(r.building[0].label, "B");
});

test("parseCapexRules: reserved keys are dropped (no prototype pollution)", () => {
  const r = parseCapexRules({
    equipment: [{ type: "Boiler", monitor: 5, replace: 9, cost: 1000 }],
    building: [
      { key: "__proto__", label: "evil", monitor: 1, replace: 1, defaultCost: 1 },
      { key: "roof", label: "Roof", monitor: 1, replace: 1, defaultCost: 1 },
    ],
  });
  assert.deepEqual(r.building.map((b) => b.key), ["roof"]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("parseCapexRules: one authoritative section, the other defaults", () => {
  const r = parseCapexRules({
    equipment: [{ type: "Boiler", monitor: 5, replace: 9, cost: 1000 }],
    building: "oops",
  });
  assert.equal(r.equipment.length, 1);
  assert.deepEqual(r.building, DEFAULT_CAPEX_RULES.building);
});

test("capexForecast: a malformed rule never throws (finite guard)", () => {
  const rules = {
    equipment: [{ type: "Roof", monitor: Number.NaN, replace: Number.NaN, cost: 1000 }],
    building: [],
  } as unknown as CapexRules;
  assert.doesNotThrow(() =>
    capexForecast([{ equipment: [{ type: "Roof", installYear: "1990" }] }], { years: 5, rules }),
  );
});

test("capexForecast: only rules-covered types are scheduled", () => {
  const now = new Date("2026-06-01");
  const base = { years: 5, now };

  // "Roof" removed from the rules → no roof line
  const noRoof = capexForecast([{ equipment: [{ type: "Roof", installYear: "1990" }] }], {
    ...base,
    rules: { equipment: [], building: [] },
  });
  assert.equal(noRoof.years.flatMap((y) => y.items).length, 0);

  // a rule added for a previously-untracked type → it schedules
  const withPump = capexForecast([{ equipment: [{ type: "Sump Pump", installYear: "2010" }] }], {
    ...base,
    rules: { equipment: [{ type: "Sump Pump", monitor: 7, replace: 10, cost: 1200 }], building: [] },
  });
  const items = withPump.years.flatMap((y) => y.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "Sump Pump");
  assert.equal(items[0].cost, 1200);
});

test("orphanedEquipmentTypes: only dropped types that some unit still uses", () => {
  const prev = DEFAULT_CAPEX_RULES;
  const next = { ...prev, equipment: prev.equipment.filter((e) => e.type !== "Roof" && e.type !== "Dishwasher") };
  const props = [
    { address: "1 A St", units: [{ equipment: [{ type: "Roof", installYear: "2010" }, { type: "Oven" }] }] },
    { address: "2 B St", units: [{ equipment: [{ type: "Roof" }] }, { equipment: [{ type: "Roof" }] }] },
    { address: "3 C St", units: [] },
  ];
  assert.deepEqual(orphanedEquipmentTypes(prev, next, props), [
    { type: "Roof", count: 3, properties: ["1 A St", "2 B St"] },
  ]);
  assert.deepEqual(orphanedEquipmentTypes(prev, prev, props), []);
  assert.deepEqual(orphanedEquipmentTypes(prev, next, []), []);
});

/* ---------------- Unit ids and renames (G2C-001) ---------------- */

const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};

test("units saved before ids existed get placeholders by place, then permanent ids on save", () => {
  const stored = [{ label: "Upper" }, { id: "u2", label: "Lower" }];
  const loaded = withUnitIds(stored);
  assert.deepEqual(loaded.map((u) => u.id), ["unit-at-0", "u2"]);
  // Saved unchanged: the placeholder becomes a real id, a real id stays, nothing is renamed.
  const { units, renames } = reconcileUnits(stored, loaded, ids());
  assert.deepEqual(units.map((u) => u.id), ["new1", "u2"]);
  assert.deepEqual(renames, []);
});

test("a renamed unit keeps its id and lists the rename; add and remove don't", () => {
  const stored = [
    { id: "a", label: "Rear" },
    { id: "b", label: "Front" },
    { id: "c", label: "Attic" },
  ];
  const edited = [
    { id: "a", label: "Unit 3" }, // renamed
    { id: "c", label: "Attic" }, // kept; "Front" removed
    { label: "Basement" }, // added
  ];
  const { units, renames } = reconcileUnits(stored, edited, ids());
  assert.deepEqual(units.map((u) => [u.id, u.label]), [["a", "Unit 3"], ["c", "Attic"], ["new1", "Basement"]]);
  assert.deepEqual(renames, [{ from: "Rear", to: "Unit 3" }]);
});

test("a rename by placeholder works the first time a legacy list is saved", () => {
  const stored = [{ label: "Floor 1" }, { label: "Floor 2" }];
  const edited = withUnitIds(stored).map((u) => (u.label === "Floor 1" ? { ...u, label: "1st Floor" } : u));
  // Remove the second one too: the first still matches by place.
  const { units, renames } = reconcileUnits(stored, edited.slice(0, 1), ids());
  assert.deepEqual(units.map((u) => [u.id, u.label]), [["new1", "1st Floor"]]);
  assert.deepEqual(renames, [{ from: "Floor 1", to: "1st Floor" }]);
});

test("ids it never stored, and repeats, are new units; blank or shared labels aren't renames", () => {
  const stored = [
    { id: "a", label: "2" },
    { id: "b", label: "Same" },
    { id: "c", label: "same" },
  ];
  const edited = [
    { id: "zzz", label: "2B" }, // not one of ours: a new unit, so "2" was removed
    { id: "a", label: "" }, // label blanked: not a rename
    { id: "b", label: "Upper" }, // "Same" named two units: ambiguous
    { id: "b", label: "Copy" }, // a repeated id is a new unit
  ];
  const { units, renames } = reconcileUnits(stored, edited, ids());
  assert.deepEqual(units.map((u) => u.id), ["new1", "a", "b", "new2"]);
  assert.deepEqual(renames, []);
});

test("a rename onto a label another unit keeps is no rename, so its jobs don't take the other unit's code", () => {
  const stored = [
    { id: "a", label: "Rear" },
    { id: "b", label: "Front" },
  ];
  assert.deepEqual(reconcileUnits(stored, [{ id: "a", label: "Front" }, { id: "b", label: "Front" }], ids()).renames, []);
  assert.deepEqual(reconcileUnits(stored, [{ id: "a", label: "front" }, { id: "b", label: "Front" }], ids()).renames, [], "case-only match too");
  // A swap keeps each new label unique, so it still counts.
  assert.deepEqual(reconcileUnits(stored, [{ id: "a", label: "Front" }, { id: "b", label: "Rear" }], ids()).renames, [
    { from: "Rear", to: "Front" },
    { from: "Front", to: "Rear" },
  ]);
});

test("rows follow renames by their old label, so a swap swaps", () => {
  const renames = [
    { from: "1", to: "2" },
    { from: "2", to: "1" },
  ];
  assert.equal(renamedLabel(renames, "1"), "2");
  assert.equal(renamedLabel(renames, " 2 "), "1");
  assert.equal(renamedLabel([{ from: "Rear", to: "Unit 3" }], "rear"), "Unit 3");
  assert.equal(renamedLabel(renames, "3"), null);
  assert.equal(renamedLabel(renames, null), null);
  const { renames: swap } = reconcileUnits(
    [
      { id: "a", label: "1" },
      { id: "b", label: "2" },
    ],
    [
      { id: "a", label: "2" },
      { id: "b", label: "1" },
    ],
    ids(),
  );
  assert.deepEqual(swap, renames);
});
