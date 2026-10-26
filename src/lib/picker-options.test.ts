import test from "node:test";
import assert from "node:assert/strict";
import { offersUnits, propertySubline, rentableUnitCount, shapePropertyOptions, townOf, unitDisplay, unitLabels } from "./picker-options-shape";

const row = (id: string, address: string, units: unknown = []) => ({ id, address, units });

test("shapePropertyOptions: street order, with the house number as a number (15 before 118)", () => {
  const options = shapePropertyOptions([
    row("a", "118 Oxford Ave, Buffalo, NY 14209"),
    row("b", "15 Oxford Ave, Buffalo, NY 14209"),
    row("c", "23 Oxford Ave, Buffalo, NY 14209"),
    row("d", "56 Congress St, Buffalo, NY 14213"),
    row("e", "9 Aaron Dr, Buffalo, NY 14201"),
  ]);
  assert.deepEqual(options.map((o) => o.id), ["e", "d", "b", "c", "a"], "Aaron, Congress, then Oxford 15, 23, 118");
});

test("shapePropertyOptions: label is the short address, address stays whole, photoUrl is null until set", () => {
  const [o] = shapePropertyOptions([row("a", "56 Tamarack St, Buffalo, NY 14209")]);
  assert.equal(o.label, "56 Tamarack St");
  assert.equal(o.address, "56 Tamarack St, Buffalo, NY 14209");
  assert.equal(o.photoUrl, null);
  const [p] = shapePropertyOptions([{ ...row("a", "1 A St"), photoUrl: "https://x.public.blob.vercel-storage.com/a.jpg" }]);
  assert.equal(p.photoUrl, "https://x.public.blob.vercel-storage.com/a.jpg");
});

test("shapePropertyOptions: units are labels only, once each, never a lockbox code", () => {
  const units = [
    { label: "Unit 1", lockboxCode: "4857" },
    { label: " Unit 2 ", lockboxCode: "1111" },
    { label: "Unit 1" },
    { label: "" },
    { lockboxCode: "9999" },
  ];
  const [o] = shapePropertyOptions([row("a", "1 A St", units)]);
  assert.deepEqual(o.units, ["Unit 1", "Unit 2"]);
  assert.equal(JSON.stringify(o).includes("4857"), false, "no code leaves the server");
  assert.deepEqual(unitLabels("not an array"), []);
  assert.deepEqual(unitLabels(null), []);
});

test("shapePropertyOptions: an empty list, and the same street twice, stay stable", () => {
  assert.deepEqual(shapePropertyOptions([]), []);
  const twins = shapePropertyOptions([row("z", "5 Elm St"), row("y", "5 Elm St")]);
  assert.deepEqual(twins.map((o) => o.id), ["y", "z"], "ties fall back to the id");
});

test("townOf and propertySubline: the town and the rentable unit count", () => {
  assert.equal(townOf("56 Tamarack St, Buffalo, NY 14209"), "Buffalo");
  assert.equal(townOf("56 Tamarack St"), "");
  assert.equal(townOf(null), "");
  // The street's comma is missing on some of HG's addresses.
  assert.equal(townOf("118 Congress St. Buffalo, NY 14213"), "Buffalo");
  assert.equal(townOf("933 Lafayette Avenue Buffalo, NY 14209"), "Buffalo");
  assert.equal(townOf("58 Mariner Street, Buffalo, NY 14201"), "Buffalo");
  assert.equal(townOf("123 Main St, Lackawanna, NY 14218"), "Lackawanna");
  assert.equal(townOf("123 Main St, Lackawanna"), "Lackawanna");
  assert.equal(propertySubline({ address: "56 Tamarack St, Buffalo, NY 14209", units: ["Unit 1", "Unit 2", "Unit 3"] }), "Buffalo · 3 units");
  assert.equal(propertySubline({ address: "5 Elm St, Buffalo, NY", units: ["Unit 1"] }), "Buffalo · 1 unit");
  assert.equal(propertySubline({ address: "5 Elm St, Buffalo, NY", units: [] }), "Buffalo");
  assert.equal(propertySubline({ address: "5 Elm St", units: ["A", "B"] }), "2 units");
});

test("rentableUnitCount: the house meter isn't a unit", () => {
  assert.equal(rentableUnitCount(["Unit 1", "Unit 2", "HSE (house)"]), 2);
  assert.equal(rentableUnitCount(["HSE"]), 0);
});

test("offersUnits: from two units, or when a unit is already set", () => {
  assert.equal(offersUnits(["Unit 1"], null), false, "one unit is the building");
  assert.equal(offersUnits([], null), false);
  assert.equal(offersUnits(["Unit 1", "Unit 2"], null), true);
  assert.equal(offersUnits(["Unit 1"], "Unit 1"), true, "a set unit stays visible");
  assert.equal(offersUnits([], "Old unit"), true);
});

test("unitDisplay: a bare number reads Unit 5, a written label stays as written", () => {
  assert.equal(unitDisplay("5"), "Unit 5");
  assert.equal(unitDisplay("2B"), "Unit 2B");
  assert.equal(unitDisplay("Unit 5"), "Unit 5");
  assert.equal(unitDisplay("Floor 1 / Lower"), "Floor 1 / Lower");
});
