import test from "node:test";
import assert from "node:assert/strict";
import { pickLockboxCode } from "@/lib/portal/access-code";
import { accessState, lockboxState, resolveLockboxCode, tenantUnit } from "./lockbox";

const units = [
  { label: "1", lockboxCode: "1234" },
  { label: "2", lockboxCode: " 5678 " },
  { label: "3", lockboxCode: "" },
];

test("a job with a unit shows that unit's code, matched by label", () => {
  assert.equal(resolveLockboxCode(units, "2"), "5678");
  assert.equal(resolveLockboxCode(units, " 1 "), "1234");
  assert.equal(lockboxState(units, "2"), "shown");
});

test("a unit with no code shows nothing", () => {
  assert.equal(resolveLockboxCode(units, "3"), null);
  assert.equal(lockboxState(units, "3"), "none");
  assert.equal(lockboxState(units, "9"), "none");
});

test("no unit: the code shows only when the property has exactly one", () => {
  assert.equal(resolveLockboxCode([{ label: "A", lockboxCode: "42" }, { label: "B" }], null), "42");
  assert.equal(resolveLockboxCode(units, null), null);
  assert.equal(lockboxState(units, null), "pick-unit");
  assert.equal(lockboxState(units, ""), "pick-unit");
});

test("a property with no codes has nothing to show", () => {
  assert.equal(lockboxState([{ label: "1" }], null), "none");
  assert.equal(lockboxState([], null), "none");
});

test("labels match case-insensitively", () => {
  assert.equal(resolveLockboxCode([{ label: "Upper", lockboxCode: "77" }], "upper"), "77");
});

test("no unit: units sharing one code show it, as the contractor's page does", () => {
  const shared = [
    { label: "Upper", lockboxCode: "6476" },
    { label: "Lower", lockboxCode: " 6476" },
  ];
  assert.equal(resolveLockboxCode(shared, null), "6476");
  assert.equal(lockboxState(shared, null), "shown");
});

test("the staff page and the portal agree on every case", () => {
  const cases: Array<[{ label?: string | null; lockboxCode?: string | null }[], string | null]> = [
    [units, "2"],
    [units, " 1 "],
    [units, "3"],
    [units, "9"],
    [units, null],
    [units, ""],
    [[{ label: "A", lockboxCode: "42" }, { label: "B" }], null],
    [[{ label: "Upper", lockboxCode: "6476" }, { label: "Lower", lockboxCode: "6476 " }], null],
    [[{ label: "Upper", lockboxCode: "77" }], "upper"],
    [[{ label: "1" }], null],
    [[], null],
  ];
  for (const [list, unit] of cases) assert.equal(resolveLockboxCode(list, unit), pickLockboxCode(list, unit), JSON.stringify([list, unit]));
});

// ---------------------------------------------------------------------------
// Permission to enter (docs/specs/tenant-contact.md section 2, tenants.md section 8)
// ---------------------------------------------------------------------------


const building = [
  { id: "f", label: "Front", lockboxCode: "2374" },
  { id: "r", label: "Rear", lockboxCode: "4857" },
  { id: "h", label: "HSE (house)" },
];

test("tenantUnit: the job's unit by label, or a property's one rentable unit", () => {
  assert.deepEqual(tenantUnit(building, "front"), { unitId: "f" });
  assert.equal(tenantUnit(building, null), null, "several units and none picked: no household");
  assert.equal(tenantUnit(building, "Attic"), null, "a label that matches nothing");
  assert.deepEqual(tenantUnit([{ id: "x", label: "House" }, { id: "m", label: "HSE (house)" }], null), { unitId: "x" }, "house-meter rows don't count");
  assert.deepEqual(tenantUnit([], null), { unitId: null }, "no units: the whole house");
  assert.equal(tenantUnit([{ label: "Old" }], "Old"), null, "a unit saved before ids existed");
});

const at = (ymd: string) => new Date(`${ymd}T17:00:00Z`);

test("accessState: vacant shows the code; occupied shows it only with permission", () => {
  assert.deepEqual(accessState(building, "Front", null, null), { code: "2374", occupied: false, permitted: false, showsLockbox: true });
  assert.deepEqual(accessState(building, "Front", { movesIn: "2025-06-01" }, null), { code: "2374", occupied: true, permitted: false, showsLockbox: false });
  assert.deepEqual(accessState(building, "Front", { movesIn: "2025-06-01" }, at("2026-11-17")), { code: "2374", occupied: true, permitted: true, showsLockbox: true });
});

test("accessState: a yes from an earlier household doesn't carry over", () => {
  assert.equal(accessState(building, "Front", { movesIn: "2026-12-01" }, at("2026-11-17")).permitted, false);
  assert.equal(accessState(building, "Front", { movesIn: "2026-11-17" }, at("2026-11-17")).permitted, true, "given on move-in day");
  assert.equal(accessState(building, "Front", { movesIn: null }, at("2026-11-17")).permitted, true, "no move-in date: they live there now");
  // 11pm in Buffalo on Nov 30 is Dec 1 in UTC: the Buffalo day decides.
  assert.equal(accessState(building, "Front", { movesIn: "2026-12-01" }, new Date("2026-12-01T04:00:00Z")).permitted, false);
});

test("accessState: permission with no code records the yes and shows nothing", () => {
  assert.deepEqual(accessState([{ id: "a", label: "A" }], "A", { movesIn: null }, at("2026-11-17")), {
    code: null,
    occupied: true,
    permitted: true,
    showsLockbox: false,
  });
});

test("accessState: a building's shared code still shows with no unit picked", () => {
  const shared = [
    { id: "u", label: "Upper", lockboxCode: "6476" },
    { id: "l", label: "Lower", lockboxCode: "6476" },
  ];
  assert.equal(tenantUnit(shared, null), null);
  assert.equal(accessState(shared, null, null, null).showsLockbox, true);
});
