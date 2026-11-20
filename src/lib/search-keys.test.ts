import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchTerms } from "@/lib/search";
import {
  SEARCHED_ACCOUNTS,
  contactFoundLine,
  foldNumber,
  keyProbes,
  numberKeys,
  phoneHasWord,
  phoneSpellings,
  propertyFoundLine,
  propertyLines,
  typeMatches,
  typeSpellings,
  wholeNumberKeys,
  type KeyedProperty,
} from "@/lib/search-keys";

const building = (units: unknown, extra: Partial<KeyedProperty> = {}): KeyedProperty => ({
  address: "767 Prospect Ave, Buffalo, NY 14213",
  units,
  loanNumber: null,
  lender: null,
  loanServicer: null,
  insurancePolicyNo: null,
  insuranceCarrier: null,
  ...extra,
});

const found = (p: KeyedProperty, q: string) => propertyFoundLine(p, q, searchTerms(q));

test("numbers fold to lowercase letters and digits, as the SQL folds them", () => {
  assert.equal(foldNumber("9258618-10"), "925861810");
  assert.equal(foldNumber("Meter - 05179975"), "meter05179975");
  assert.equal(foldNumber("(716) 555-0142"), "7165550142");
  assert.equal(foldNumber(null), "");
});

test("a word is read as a number only with a digit and four characters, and also without leading zeros", () => {
  assert.deepEqual(numberKeys("RG240"), ["rg240"]);
  assert.deepEqual(numberKeys("9258618-10"), ["925861810"]);
  assert.deepEqual(numberKeys("05487400"), ["05487400", "5487400"]);
  assert.deepEqual(numberKeys("0012"), ["0012"], "12 alone is too short");
  assert.deepEqual(numberKeys("767"), []);
  assert.deepEqual(numberKeys("tenant"), []);
});

test("the whole query is one number only when it's more than one word", () => {
  assert.deepEqual(wholeNumberKeys("(716) 555-0142", searchTerms("(716) 555-0142")), ["7165550142"]);
  assert.deepEqual(wholeNumberKeys("253.64722406", searchTerms("253.64722406")), ["25364722406"]);
  assert.deepEqual(wholeNumberKeys("rg240", searchTerms("rg240")), []);
});

test("type words: three letters at least, everyday names, matched at the start of a word of the type", () => {
  assert.deepEqual(typeSpellings("Fridge"), ["fridge", "refrigerator"]);
  assert.deepEqual(typeSpellings("washer"), ["washer", "washing machine"]);
  assert.deepEqual(typeSpellings("ov"), []);
  // An Object.prototype name is no everyday name: "constructor" once made every search fail.
  assert.deepEqual(typeSpellings("constructor"), ["constructor"]);
  assert.doesNotThrow(() => keyProbes("abc constructor", searchTerms("abc constructor")));
  assert.deepEqual(typeSpellings("a/c"), []);
  assert.ok(typeMatches("Water Heater", "heat"));
  assert.ok(typeMatches("Water Heater", "water heater"));
  assert.ok(typeMatches("Washing Machine", "washing machine"));
  assert.ok(!typeMatches("Water Heater", "ate"));
  assert.ok(!typeMatches("Microwave", "wave"));
});

test("probes: each word's numbers and type spellings, then the whole query", () => {
  assert.deepEqual(keyProbes("prospect fridge", searchTerms("prospect fridge")), [
    { term: 0, kind: "type", text: "prospect" },
    { term: 1, kind: "type", text: "fridge" },
    { term: 1, kind: "type", text: "refrigerator" },
  ]);
  assert.deepEqual(keyProbes("(716) 555-0142", searchTerms("(716) 555-0142")), [
    { term: 1, kind: "number", text: "5550142" },
    { term: -1, kind: "number", text: "7165550142" },
  ]);
});

test("the lines are equipment and the three account numbers, never a lockbox code, autopay or LOFL", () => {
  const lines = propertyLines(
    building([
      {
        label: "Upper",
        lockboxCode: "4521",
        lockboxLocation: "Back door 7788",
        utilities: { nationalGridAcct: "1607524355", nationalGridAutopay: "Yes 5555", nationalGridLofl: "81531-59050", waterAcct: "Meter - 05179975" },
        equipment: [{ type: "HVAC", model: "AUH1B060A9361A", comment: "serial 99887766" }],
      },
    ]),
  );
  assert.deepEqual(
    lines.map((l) => [l.label, l.value]),
    [
      ["HVAC", "AUH1B060A9361A"],
      ["National Grid", "1607524355"],
      ["Buffalo Water", "Meter - 05179975"],
    ],
  );
  assert.deepEqual([...SEARCHED_ACCOUNTS], ["nationalGridAcct", "nationalFuelAcct", "waterAcct"]);
});

test("the found line holds the most leftover words, and counts the other units with the same kind", () => {
  const p = building([
    { id: "a", label: "Upper", equipment: [{ type: "Refrigerator", model: "WRT518S7FM04" }, { type: "Oven", model: "NX60A" }] },
    { id: "b", label: "Lower", equipment: [{ type: "Refrigerator", model: "ET4WSKXSQ00" }] },
    { id: "c", label: "Rear", equipment: [{ type: "Refrigerator", model: "" }] },
  ]);
  assert.deepEqual(found(p, "prospect fridge"), {
    matched: { unit: "Upper", label: "Refrigerator", value: "WRT518S7FM04", code: true, more: 2 },
    target: "a.equipment.0",
  });
  // A model and a type together pick the item that has both.
  assert.deepEqual(found(p, "fridge et4w")?.matched, { unit: "Lower", label: "Refrigerator", value: "ET4WSKXSQ00", code: true, more: 0 });
  // Every word in the address: nothing hidden to name.
  assert.equal(found(p, "767 prospect ave"), null);
});

test("a number typed with a space names the line the whole number is on, not the first that holds its first piece", () => {
  const p = building([
    { id: "up", label: "2nd Floor", equipment: [{ type: "HVAC", model: "GM9S960603BN-AB" }] },
    { id: "front", label: "Front", equipment: [{ type: "HVAC", model: "GM9S960603BN-AA" }] },
    { id: "rear", label: "Rear", utilities: { nationalFuelAcct: "9258618-20" } },
    { id: "side", label: "Side", utilities: { nationalFuelAcct: "9258618-10" } },
  ]);
  assert.deepEqual(found(p, "GM9S960603BN AA"), {
    matched: { unit: "Front", label: "HVAC", value: "GM9S960603BN-AA", code: true, more: 0 },
    target: "front.equipment.0",
  });
  assert.equal(found(p, "9258618 10")?.matched.unit, "Side");
  // Two words on two different lines, neither a whole number: the per-word pick stands.
  assert.equal(found(building([{ id: "a", label: "A", equipment: [{ type: "HVAC", model: "GM9S960603BN-AB" }] }], { lender: "Vontive" }), "vontive gm9s")?.matched.label, "HVAC");
});

test("a contractor's phone or email, never what the row already shows", () => {
  const c = { fullName: "Luis Ortiz", company: "Ortiz Plumbing", trade: "Plumbing", phone: "716-555-0142", phoneE164: "+17165550142", email: "luis@ortiz.co" };
  const q = "(716) 555-0142";
  assert.deepEqual(contactFoundLine(c, q, searchTerms(q))?.matched, { unit: null, label: "Phone", value: "716-555-0142", code: true, more: 0 });
  assert.deepEqual(contactFoundLine(c, "ortiz.co", searchTerms("ortiz.co"))?.matched.label, "Email");
  assert.equal(contactFoundLine(c, "ortiz plumbing", searchTerms("ortiz plumbing")), null);
  // Imported with the shown phone only, and typed with the +1 a phone app copies.
  const old = { ...c, phoneE164: null };
  for (const typed of ["+17165550142", "1-716-555-0142", "1 716 555 0142"]) {
    assert.equal(contactFoundLine(old, typed, searchTerms(typed))?.matched.label, "Phone", typed);
  }
});

test("typed digits read as the phone column shows them, from the end and from the start", () => {
  assert.deepEqual(phoneSpellings("7168539547"), ["716-853-9547"]);
  assert.deepEqual(phoneSpellings("17168539547"), ["716-853-9547"]);
  assert.deepEqual(phoneSpellings("8539547"), ["853-9547", "853-954-7"]);
  assert.deepEqual(phoneSpellings("9547"), ["9547", "954-7"]);
  assert.deepEqual(phoneSpellings("rg240"), []);
  assert.deepEqual(phoneSpellings("123456789012"), []);
});

test("the tenants list reads phone digits the same way", () => {
  assert.ok(phoneHasWord("716-555-1234", "555-1234"));
  assert.ok(phoneHasWord("+17165551234", "7165551234"));
  assert.ok(phoneHasWord("716-555-1234", "+17165551234"), "a shown phone, typed with its +1");
  assert.ok(!phoneHasWord("716-555-1234", "716"), "three digits are too few");
  assert.ok(!phoneHasWord(null, "5551234"));
});

test("the SQL reads the same paths and folds the same way as the JS", () => {
  const source = readFileSync(join(__dirname, "search-results.ts"), "utf8");
  for (const field of SEARCHED_ACCOUNTS) assert.match(source, new RegExp(`\\$\\[\\*\\]\\.utilities\\.${field}'`));
  assert.match(source, /\$\[\*\]\.equipment\[\*\]\.model'/);
  assert.match(source, /\$\[\*\]\.equipment\[\*\]\.type'/);
  assert.match(source, /'\[\^a-z0-9\]', '', 'g'/);
  assert.match(source, /'\(\^\|\[\^a-z\]\)' \|\| k\.text/);
  assert.doesNotMatch(source, /lockboxCode|lockboxLocation|Autopay|Lofl/, "search never reads a lockbox, autopay or LOFL field");
});
