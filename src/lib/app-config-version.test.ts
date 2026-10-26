import test from "node:test";
import assert from "node:assert/strict";
import { blobVersion } from "./app-config-version";

const rules = { equipment: [{ type: "Furnace", monitor: 12, replace: 17, cost: 6000 }], building: [] };

test("a blob's version is the same however its keys were ordered", () => {
  const a = blobVersion(rules);
  const reordered = { building: [], equipment: [{ cost: 6000, replace: 17, monitor: 12, type: "Furnace" }] };
  assert.equal(blobVersion(reordered), a);
  assert.match(a ?? "", /^[0-9a-z]+-[0-9a-z]+$/);
});

test("any change to what's stored changes the version", () => {
  const a = blobVersion(rules);
  assert.notEqual(blobVersion({ ...rules, equipment: [{ ...rules.equipment[0], replace: 18 }] }), a);
  assert.notEqual(blobVersion({ ...rules, building: [{ key: "roof", label: "Roof" }] }), a);
  // Array order is part of what's stored.
  const two = [{ type: "A" }, { type: "B" }];
  assert.notEqual(blobVersion({ equipment: two }), blobVersion({ equipment: [...two].reverse() }));
});

test("a column nothing was saved into has no version", () => {
  assert.equal(blobVersion(null), null);
  assert.equal(blobVersion(undefined), null);
  // The column's own default, which a row created by the other tab leaves behind.
  assert.equal(blobVersion({}), null);
  assert.notEqual(blobVersion([]), null);
});

test("the two Settings blobs never share a version unless they hold the same thing", () => {
  const moveIn = { sections: [{ key: "kitchen", label: "Kitchen", items: [{ key: "sink", label: "Sink" }] }] };
  assert.notEqual(blobVersion(moveIn), blobVersion(rules));
});
