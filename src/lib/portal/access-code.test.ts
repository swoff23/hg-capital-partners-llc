import test from "node:test";
import assert from "node:assert/strict";
import { CODE_MASK, lockboxMasker, maskCodes, pickLockboxCode, readJobAccess, readLockboxCode, pickLockboxAccess } from "./access-code";

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

// ---------------------------------------------------------------------------
// Codes inside a comment
// ---------------------------------------------------------------------------

const house = [
  { label: "Lower", lockboxCode: "1924 (back entrance)" },
  { label: "Upper", lockboxCode: "2925" },
  { label: "Attic", lockboxCode: "ab" },
];

const maskerFor = (units: unknown) =>
  lockboxMasker({ property: { findUnique: async () => ({ units }) } } as unknown as Parameters<typeof lockboxMasker>[0], "p1");

test("a stored code in a comment is replaced on the server, and the parts never hold it", async () => {
  const mask = await maskerFor(house);
  const parts = mask("Gate code is 2925, then the back door.");
  assert.deepEqual(parts, [{ text: "Gate code is " }, { masked: CODE_MASK }, { text: ", then the back door." }]);
  assert.equal(JSON.stringify(parts).includes("2925"), false);
});

test("a code saved with a note is found by its first word, and by the whole value", async () => {
  const mask = await maskerFor(house);
  assert.deepEqual(mask("use 1924 for the lower"), [{ text: "use " }, { masked: CODE_MASK }, { text: " for the lower" }]);
  assert.deepEqual(mask("1924 (back entrance)"), [{ masked: CODE_MASK }], "the whole value is one hidden code, not a code and a stray note");
});

test("it matches whole words only, in any case, with punctuation either side", async () => {
  const mask = await maskerFor([{ label: "A", lockboxCode: "AB12" }]);
  assert.deepEqual(mask("(ab12)"), [{ text: "(" }, { masked: CODE_MASK }, { text: ")" }]);
  assert.deepEqual(mask("AB123"), [{ text: "AB123" }], "inside a longer run of letters and digits");
  assert.deepEqual(mask("xAB12"), [{ text: "xAB12" }]);
});

test("a stored value too short to tell from a word is never hidden", async () => {
  const mask = await maskerFor(house);
  assert.deepEqual(mask("ab is not a code"), [{ text: "ab is not a code" }]);
});

test("the same code twice is hidden twice", async () => {
  const mask = await maskerFor(house);
  assert.deepEqual(mask("2925 or 2925"), [{ masked: CODE_MASK }, { text: " or " }, { masked: CODE_MASK }]);
});

test("a job with no property, or a property with no codes, shows the text as it is", async () => {
  const none = await lockboxMasker({ property: { findUnique: async () => null } } as unknown as Parameters<typeof lockboxMasker>[0], null);
  assert.deepEqual(none("code 2925"), [{ text: "code 2925" }]);
  const empty = await maskerFor([{ label: "A" }, { label: "B", lockboxCode: "" }]);
  assert.deepEqual(empty("code 2925"), [{ text: "code 2925" }]);
  assert.deepEqual(empty(""), []);
});

test("regex characters in a code are literal", () => {
  assert.deepEqual(maskCodes("pin a.b+c today", ["a.b+c"]), [{ text: "pin " }, { masked: CODE_MASK }, { text: " today" }]);
  assert.deepEqual(maskCodes("pin axb+c", ["a.b+c"]), [{ text: "pin axb+c" }]);
});

test("lockboxMasker reads one column of one property, once", async () => {
  const calls: unknown[] = [];
  const db = {
    property: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return { units: house };
      },
    },
  } as unknown as Parameters<typeof lockboxMasker>[0];
  const mask = await lockboxMasker(db, "p1");
  mask("a");
  mask("b");
  assert.deepEqual(calls, [{ where: { id: "p1" }, select: { units: true } }]);
});

/* ---------------- Location and photo (docs/specs/lockbox-location.md) ---------------- */

const gate = { pathname: "properties/p1/lockbox/gate.jpg", thumbPathname: "properties/p1/lockbox/thumb/gate.jpg" };

test("pickLockboxAccess: the job's unit brings its location and photo with its code", () => {
  const units = [
    { label: "Lower", lockboxCode: "1924", lockboxLocation: "Back entrance", lockboxPhoto: { ...gate, width: 10, height: 10 } },
    { label: "Attic", lockboxCode: "4857", lockboxLocation: "Back left corner of the house" },
  ];
  assert.deepEqual(pickLockboxAccess(units, "lower"), { code: "1924", location: "Back entrance", photo: gate });
  assert.deepEqual(pickLockboxAccess(units, "Attic"), { code: "4857", location: "Back left corner of the house", photo: null });
});

test("pickLockboxAccess: no code, no lockbox, whatever else is on file", () => {
  const units = [{ label: "Unit 2", lockboxCode: "", lockboxLocation: "Side door", lockboxPhoto: gate }];
  assert.equal(pickLockboxAccess(units, "Unit 2"), null);
  assert.equal(pickLockboxAccess(units, null), null);
});

test("pickLockboxAccess: no unit and one shared code takes the first location and photo on file", () => {
  const units = [
    { label: "Lower", lockboxCode: "6385" },
    { label: "Upper", lockboxCode: "6385", lockboxLocation: "On the gate", lockboxPhoto: gate },
    { label: "HSE (house)" },
  ];
  assert.deepEqual(pickLockboxAccess(units, null), { code: "6385", location: "On the gate", photo: gate });
  assert.equal(pickLockboxAccess([...units, { label: "Attic", lockboxCode: "4857" }], null), null);
});

test("pickLockboxAccess: a photo without a usable pathname is none", () => {
  const units = [{ label: "Lower", lockboxCode: "1924", lockboxPhoto: { pathname: "" } }];
  assert.deepEqual(pickLockboxAccess(units, "Lower"), { code: "1924", location: null, photo: null });
});

// ---------------------------------------------------------------------------
// readJobAccess (docs/specs/tenant-contact.md section 7, tenants.md section 8)
// ---------------------------------------------------------------------------

const homes = [
  { id: "f", label: "Front", lockboxCode: "2374", lockboxLocation: "By the side door" },
  { id: "r", label: "Rear", lockboxCode: "4857" },
];
const person = (fullName: string, phone: string | null = null) => ({ tenant: { fullName, phone, phoneE164: phone ? `+1${phone.replace(/\D/g, "")}` : null } });
const leaseRows = [
  { unitId: "f", movesIn: new Date("2025-06-01"), movesOut: null, tenants: [person("Dana Lee", "716-555-0142"), person("Sam Ortiz")] },
  { unitId: "f", movesIn: new Date("2024-01-01"), movesOut: new Date("2025-05-31"), tenants: [person("Past Person", "716-555-0000")] },
  { unitId: "f", movesIn: new Date("2027-02-01"), movesOut: null, tenants: [person("Next Person", "716-555-0001")] },
];

function fakeDb(seen: unknown[] = [], units: unknown[] = homes) {
  return {
    property: { findUnique: async () => ({ units }) },
    lease: {
      findMany: async (args: { where: { unitId: string | null } }) => {
        seen.push(args.where);
        return leaseRows.filter((l) => l.unitId === args.where.unitId);
      },
    },
  } as unknown as Parameters<typeof readJobAccess>[0];
}

const NOW = new Date("2026-11-17T17:00:00Z");

test("readJobAccess: an occupied home shows the household living there today, and no lockbox without permission", async () => {
  const seen: unknown[] = [];
  const got = await readJobAccess(fakeDb(seen), { propertyId: "p1", unitLabel: "front", entryPermittedAt: null }, NOW);
  assert.deepEqual(got.tenants, [
    { name: "Dana Lee", phone: "716-555-0142", dial: "+17165550142" },
    { name: "Sam Ortiz", phone: null, dial: null },
  ]);
  assert.equal(got.permitted, false);
  assert.equal(got.vacant, false);
  assert.equal(got.lockbox, null);
  assert.deepEqual(seen, [{ propertyId: "p1", unitId: "f" }], "one unit's leases, by its id");
});

test("readJobAccess: permission adds the lockbox, with its location", async () => {
  const got = await readJobAccess(fakeDb(), { propertyId: "p1", unitLabel: "Front", entryPermittedAt: NOW }, NOW);
  assert.equal(got.permitted, true);
  assert.deepEqual(got.lockbox, { code: "2374", location: "By the side door", photo: null });
});

test("readJobAccess: a vacant unit shows the lockbox and no tenants", async () => {
  const got = await readJobAccess(fakeDb(), { propertyId: "p1", unitLabel: "Rear", entryPermittedAt: null }, NOW);
  assert.deepEqual(got.tenants, []);
  assert.equal(got.vacant, true);
  assert.equal(got.lockbox?.code, "4857");
});

test("readJobAccess: a job on the house-meter row is the building's, never an empty home", async () => {
  const duplex = [
    { id: "u", label: "Upper", lockboxCode: "1111" },
    { id: "l", label: "Lower", lockboxCode: "2222" },
    { id: "h", label: "HSE (house)", lockboxCode: "3333" },
  ];
  const got = await readJobAccess(fakeDb([], duplex), { propertyId: "p1", unitLabel: "HSE (house)", entryPermittedAt: null }, NOW);
  assert.equal(got.lockbox?.code, "3333", "its own code still shows, as before");
  assert.equal(got.vacant, false);
});

test("readJobAccess: a building-wide job behind a shared code shows the code but never calls the home empty", async () => {
  const shared = [
    { id: "f", label: "Front", lockboxCode: "4857" },
    { id: "r", label: "Rear", lockboxCode: "4857" },
  ];
  const got = await readJobAccess(fakeDb([], shared), { propertyId: "p1", unitLabel: null, entryPermittedAt: null }, NOW);
  assert.equal(got.lockbox?.code, "4857", "the units share one box, so the code shows");
  assert.equal(got.vacant, false, "nobody's lease was read, so the page says nothing about who lives there");
  assert.equal(got.needsNotice, false);
});

test("readJobAccess: no unit on a building names no household, and no property shows nothing", async () => {
  const seen: unknown[] = [];
  const got = await readJobAccess(fakeDb(seen), { propertyId: "p1", unitLabel: null, entryPermittedAt: null }, NOW);
  assert.deepEqual(got.tenants, []);
  assert.equal(got.vacant, false);
  assert.deepEqual(seen, [], "no lease read at all");
  assert.deepEqual(await readJobAccess(fakeDb(), { propertyId: null, unitLabel: "Front", entryPermittedAt: NOW }, NOW), {
    tenants: [],
    permitted: false,
    needsNotice: false,
    vacant: false,
    lockbox: null,
  });
});
