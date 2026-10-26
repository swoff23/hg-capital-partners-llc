import test from "node:test";
import assert from "node:assert/strict";
import { capitalizedName, cleanTrades, docOnFile, joinDocLines, mailtoHref, mapsHref, planContactFixes, splitDocLines, telHref, textHref } from "./contacts";

test("phone numbers and emails become tel: and mailto: links (ADMIN-004)", () => {
  assert.equal(telHref("716-555-1234"), "tel:7165551234");
  assert.equal(telHref("+1 (716) 555-1234"), "tel:+17165551234");
  assert.equal(telHref("555-1234"), null);
  assert.equal(telHref(""), null);
  assert.equal(telHref(null), null);
  assert.equal(mailtoHref(" zack@example.com "), "mailto:zack@example.com");
  assert.equal(mailtoHref("zack@example"), null);
  assert.equal(mailtoHref("a@x.com, b@y.com"), null);
  assert.equal(mailtoHref(null), null);
});

test("a phone gets a Text link and a mailing address a maps link (ADMIN-004)", () => {
  assert.equal(textHref("716-555-1234"), "sms:7165551234");
  assert.equal(textHref("+1 (716) 555-1234"), "sms:+17165551234");
  assert.equal(textHref("555-1234"), null);
  assert.equal(textHref(null), null);
  assert.equal(mapsHref("25 Moore Ave Buffalo  14223"), "https://maps.apple.com/?q=25%20Moore%20Ave%20Buffalo%2014223");
  assert.equal(mapsHref("6207 route 98, Arcade N.Y. 14009"), "https://maps.apple.com/?q=6207%20route%2098%2C%20Arcade%20N.Y.%2014009");
  assert.equal(mapsHref(" - "), null);
  assert.equal(mapsHref(""), null);
  assert.equal(mapsHref(null), null);
});

test("a W-9 the import noted as on file is found in the notes (ADMIN-022)", () => {
  const notes = "Prefers texts\nW-9 on file: fw9_Final Touch Home Renovations LLC.pdf\nInsurance on file: COI 2025.pdf";
  assert.equal(docOnFile(notes, "W-9"), "fw9_Final Touch Home Renovations LLC.pdf");
  assert.equal(docOnFile(notes, "Insurance"), "COI 2025.pdf");
  assert.equal(docOnFile("Prefers texts", "W-9"), null);
  assert.equal(docOnFile(null, "W-9"), null);
  // Only a line that starts with it, as the importer writes it.
  assert.equal(docOnFile("Asked for the W-9 on file: none yet", "W-9"), null);
});

test("trades lose the repeats the import's merge left in (ADMIN-023)", () => {
  assert.equal(cleanTrades("HVAC / HVAC"), "HVAC");
  assert.equal(cleanTrades("Electric / electric"), "Electric");
  assert.equal(cleanTrades("Demo/Framing/Trim / Framing/General/Tile/Drywall/Trim"), "Demo / Framing / Trim / General / Tile / Drywall");
  // No repeats: exactly as stored.
  assert.equal(cleanTrades("Plumber/minor HVAC / Plumbing"), "Plumber/minor HVAC / Plumbing");
  assert.equal(cleanTrades("Rats/Pests"), "Rats/Pests");
  assert.equal(cleanTrades("  "), null);
  assert.equal(cleanTrades(null), null);
});

test("lowercase names get capitals; names that have them are left alone (ADMIN-023)", () => {
  assert.equal(capitalizedName("John detzler"), "John Detzler");
  assert.equal(capitalizedName("Jacob (Jake) hoak"), "Jacob (Jake) Hoak");
  assert.equal(capitalizedName("William Antonio hurtado chavez"), "William Antonio Hurtado Chavez");
  assert.equal(capitalizedName("mary-jo o'neil"), "Mary-Jo O'Neil");
  assert.equal(capitalizedName("Ana de la Cruz"), null);
  assert.equal(capitalizedName("de la cruz"), "De la Cruz");
  assert.equal(capitalizedName("Zack McDonald"), null);
  assert.equal(capitalizedName("Mike Morris (Freedom Electric)"), null);
});

test("the cleanup lists only contacts that change, and only what changes", () => {
  const plan = planContactFixes([
    { id: "a", fullName: "Steve Fuller", trades: "HVAC / HVAC" },
    { id: "b", fullName: "John detzler", trades: "Paint / Misc." },
    { id: "c", fullName: "Jose Alvarez", trades: "Floor Install only / Flooring" },
    { id: "d", fullName: "jacob hoak", trades: "Electric / Electric" },
    { id: "e", fullName: "Kim Lockett", trades: null },
  ]);
  assert.deepEqual(plan, [
    { id: "a", fullName: "Steve Fuller", trades: { from: "HVAC / HVAC", to: "HVAC" } },
    { id: "b", fullName: "John detzler", name: "John Detzler" },
    { id: "d", fullName: "jacob hoak", name: "Jacob Hoak", trades: { from: "Electric / Electric", to: "Electric" } },
  ]);
  // Run again on the fixed values: nothing left to do.
  assert.deepEqual(
    planContactFixes([
      { id: "a", fullName: "Steve Fuller", trades: "HVAC" },
      { id: "b", fullName: "John Detzler", trades: "Paint / Misc." },
    ]),
    [],
  );
});

test("Connor's three hand fixes: trades out of Company, the company out of a name, matched exactly (decision 31)", () => {
  const before = [
    { id: "jer", fullName: "Jeremiah Anderson", company: "Electric", trades: "Electric / Electric" },
    { id: "kim", fullName: "Kim Lockett", company: "House Cleaner", trades: "House Cleaner / Property Cleaning" },
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", company: "Freedom Electric", trades: "Electric / Electric" },
    // Same names with other values, and the same company on someone else: never touched.
    { id: "jer2", fullName: "Jeremiah Anderson", company: "Anderson Electric LLC", trades: "Electric" },
    { id: "kim2", fullName: "Kim lockett", company: "House Cleaner", trades: "Cleaning" },
    { id: "other", fullName: "Sam Sparks", company: "Electric", trades: null },
    { id: "mike2", fullName: "Mike Morris (Freedom Electric)", company: "Morris Co", trades: null },
  ];
  assert.deepEqual(planContactFixes(before), [
    { id: "jer", fullName: "Jeremiah Anderson", trades: { from: "Electric / Electric", to: "Electric" }, company: { from: "Electric", to: null } },
    // House Cleaner is already a trade: only Company changes.
    { id: "kim", fullName: "Kim Lockett", company: { from: "House Cleaner", to: null } },
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", name: "Mike Morris", trades: { from: "Electric / Electric", to: "Electric" } },
    { id: "kim2", fullName: "Kim lockett", name: "Kim Lockett" },
  ]);

  // A trade that wasn't listed yet is added; a blank company is filled.
  assert.deepEqual(planContactFixes([{ id: "jer", fullName: "Jeremiah Anderson", company: "Electric", trades: null }]), [
    { id: "jer", fullName: "Jeremiah Anderson", trades: { from: null, to: "Electric" }, company: { from: "Electric", to: null } },
  ]);
  assert.deepEqual(planContactFixes([{ id: "kim", fullName: "Kim Lockett", company: "House Cleaner", trades: "Property Cleaning" }])[0].trades, {
    from: "Property Cleaning",
    to: "Property Cleaning / House Cleaner",
  });
  assert.deepEqual(planContactFixes([{ id: "mike", fullName: "Mike Morris (Freedom Electric)", company: null, trades: "Electric" }]), [
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", name: "Mike Morris", company: { from: null, to: "Freedom Electric" } },
  ]);

  // Applied: a second run finds nothing.
  assert.deepEqual(
    planContactFixes([
      { id: "jer", fullName: "Jeremiah Anderson", company: null, trades: "Electric" },
      { id: "kim", fullName: "Kim Lockett", company: null, trades: "House Cleaner / Property Cleaning" },
      { id: "mike", fullName: "Mike Morris", company: "Freedom Electric", trades: "Electric" },
    ]),
    [],
  );
  // A caller that didn't read Company changes no company.
  assert.deepEqual(planContactFixes([{ id: "kim", fullName: "Kim Lockett", trades: null }]), []);
});

test("splitDocLines keeps the import's document lines apart from the notes", () => {
  const stored = "Prefers texts\nW-9 on file: w9-2024.pdf\n\nInsurance on file: coi.pdf\nGate code with Pieter";
  const { notes, docLines } = splitDocLines(stored);
  assert.equal(notes, "Prefers texts\n\nGate code with Pieter");
  assert.deepEqual(docLines, ["W-9 on file: w9-2024.pdf", "Insurance on file: coi.pdf"]);
  assert.deepEqual(splitDocLines(null), { notes: null, docLines: [] });
  assert.deepEqual(splitDocLines("W-9 on file: a.pdf"), { notes: null, docLines: ["W-9 on file: a.pdf"] });
});

test("joinDocLines puts edited notes back with the document lines", () => {
  assert.equal(joinDocLines("New note", ["W-9 on file: a.pdf"]), "New note\nW-9 on file: a.pdf");
  assert.equal(joinDocLines(null, ["W-9 on file: a.pdf"]), "W-9 on file: a.pdf");
  assert.equal(joinDocLines("  ", []), null);
  // Round trip: what docOnFile reads survives an edit of the notes.
  const saved = joinDocLines("Edited", splitDocLines("Old\nInsurance on file: coi.pdf").docLines);
  assert.equal(docOnFile(saved, "Insurance"), "coi.pdf");
});
