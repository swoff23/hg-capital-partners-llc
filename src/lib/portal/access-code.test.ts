import test from "node:test";
import assert from "node:assert/strict";
import { CODE_MASK, lockboxMasker, maskCodes, pickLockboxCode, readLockboxCode } from "./access-code";

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
