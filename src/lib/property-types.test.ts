import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAPEX_RULES,
  parseCapexRules,
  capexForecast,
  type CapexRules,
} from "./property-types";

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
