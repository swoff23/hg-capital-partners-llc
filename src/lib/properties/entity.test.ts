import test from "node:test";
import assert from "node:assert/strict";
import { ENTITY_NAMES } from "../quickbooks/entities";
import { OFFERED_ENTITIES, entityChoices, entityName } from "./entity";

test("ENTITY_NAMES: the five companies in their QuickBooks order", () => {
  assert.deepEqual(ENTITY_NAMES, [
    "HG Capital Partners LLC",
    "HG Buffalo Holding 1 LLC",
    "HG Buffalo Holding 2 LLC",
    "HG Buffalo Property Management LLC",
    "BMK Property Group LLC",
  ]);
});

test("OFFERED_ENTITIES: the holding companies, without the management company or BMK", () => {
  assert.deepEqual(OFFERED_ENTITIES, ["HG Capital Partners LLC", "HG Buffalo Holding 1 LLC", "HG Buffalo Holding 2 LLC"]);
});

test("entityName: blank clears the entity", () => {
  assert.equal(entityName(null), null);
  assert.equal(entityName("   "), null);
});

test("entityName: a QuickBooks company saves in its own spelling", () => {
  assert.equal(entityName("hg capital partners llc"), "HG Capital Partners LLC");
  assert.equal(entityName("  HG Buffalo   Holding 1 LLC "), "HG Buffalo Holding 1 LLC");
  assert.equal(entityName("bmk property group llc"), "BMK Property Group LLC");
});

test("entityName: a new name is kept as typed, spacing tidied", () => {
  assert.equal(entityName("  Linwood  Partners LLC "), "Linwood Partners LLC");
});

test("entityChoices: the offered companies, then added names A to Z, once each", () => {
  assert.deepEqual(
    entityChoices([
      "HG Capital Partners LLC",
      "Zeta Holdings LLC",
      null,
      "Alder LLC",
      "alder llc",
      "HG Buffalo Holding 2 LLC",
    ]),
    [...OFFERED_ENTITIES, "Alder LLC", "Zeta Holdings LLC"],
  );
});

test("entityChoices: names QuickBooks knows and pasted notes aren't added names", () => {
  assert.deepEqual(
    entityChoices(["BMK Property Group LLC", "HG Buffalo Property Management LLC", "1) 50% BK \n2) 50% HG Buffalo Holding 1 LLC", "  "]),
    [...OFFERED_ENTITIES],
  );
});
