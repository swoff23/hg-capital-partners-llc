import test from "node:test";
import assert from "node:assert/strict";
import { capitalizedName, cleanTrades, docOnFile, mailtoHref, planContactFixes, telHref } from "./contacts";

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
