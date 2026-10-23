import test from "node:test";
import assert from "node:assert/strict";
import { pickLockboxCode, readLockboxCode } from "./access-code";

const duplex = [
  { label: "Lower", lockboxCode: "1924 (back entrance)" },
  { label: "Upper", lockboxCode: "2925" },
  { label: "Attic", lockboxCode: "" },
];

test("a job with a unit gets that unit's code", () => {
  assert.equal(pickLockboxCode(duplex, "Upper"), "2925");
  assert.equal(pickLockboxCode(duplex, "  lower "), "1924 (back entrance)");
});

test("a unit with no code, or a unit that isn't listed, gets none", () => {
  assert.equal(pickLockboxCode(duplex, "Attic"), null);
  assert.equal(pickLockboxCode(duplex, "Basement"), null);
});

test("no unit: the code shows only when the property has exactly one", () => {
  assert.equal(pickLockboxCode(duplex, null), null);
  assert.equal(pickLockboxCode([{ label: "Front", lockboxCode: "6476" }, { label: "Rear", lockboxCode: "6476 " }], null), "6476");
  assert.equal(pickLockboxCode([{ label: "Unit 4", lockboxCode: "4154" }, { label: "Unit 5", lockboxCode: null }], ""), "4154");
});

test("a named unit never falls back to the property's single code", () => {
  assert.equal(pickLockboxCode([{ label: "Front", lockboxCode: "6476" }, { label: "Rear" }], "Rear"), null);
});

test("anything that isn't a list of units gives no code", () => {
  for (const bad of [null, undefined, {}, "6476", [null, 3, "x"], [{ lockboxCode: 1234 }]]) {
    assert.equal(pickLockboxCode(bad, null), null);
  }
});

test("readLockboxCode selects only that column of that property", async () => {
  const calls: unknown[] = [];
  const db = {
    property: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return { units: duplex };
      },
    },
  } as unknown as Parameters<typeof readLockboxCode>[0];
  assert.equal(await readLockboxCode(db, "p1", "Upper"), "2925");
  assert.deepEqual(calls, [{ where: { id: "p1" }, select: { units: true } }]);
  assert.equal(await readLockboxCode(db, null, "Upper"), null);
  assert.equal(calls.length, 1);
});
