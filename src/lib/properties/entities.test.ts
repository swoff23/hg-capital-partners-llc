import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { uniqueEntities } from "./entities";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the entity list trims, drops blanks and repeats, and keeps the order it came in", () => {
  assert.deepEqual(uniqueEntities(["HG 1 LLC", " HG 1 LLC ", null, "", "  ", undefined, "HG 2 LLC"]), ["HG 1 LLC", "HG 2 LLC"]);
  assert.deepEqual(uniqueEntities([]), []);
});

test("New property and a property's Details read the same list, and Details offers it as suggestions on Entity", () => {
  const read_ = read("./read.ts");
  assert.match(read_, /export const getEntityNames = cache\(/);
  assert.match(read_, /uniqueEntities\(/);
  assert.match(read("../../app/(app)/properties/new/new-property-screen.tsx"), /getEntityNames\(\)/);
  assert.match(read("../../app/(app)/properties/[id]/page.tsx"), /getEntityNames\(\)/);
  const details = read("../../app/(app)/properties/[id]/edit-details.tsx");
  assert.match(details, /field="llcOwner" label="Entity" kind="text" suggestions=\{entities\}/);
});
