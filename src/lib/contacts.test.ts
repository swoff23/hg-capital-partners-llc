import test from "node:test";
import assert from "node:assert/strict";
import { capitalizedName, docOnFile, joinDocLines, mailtoHref, mapsHref, planContactFixes, splitDocLines, telHref, textHref } from "./contacts";
import { readNewContact } from "./contractors/contact-fields";

test("a new contractor keeps the notes and leaves the import's document lines to the importer", () => {
  const r = readNewContact({ fullName: "Zack Reading", comments: "Prefers texts.\nGate code with Pieter" });
  assert.deepEqual(r.ok && r.data.comments, "Prefers texts.\nGate code with Pieter");
  assert.deepEqual(splitDocLines(r.ok ? r.data.comments : null), { notes: "Prefers texts.\nGate code with Pieter", docLines: [] });
});

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
    { id: "a", fullName: "Steve Fuller", trades: ["HVAC"] },
    { id: "b", fullName: "John detzler", trades: ["Handyman", "Painting"] },
    { id: "d", fullName: "jacob hoak", trades: ["Electric"] },
    { id: "e", fullName: "Kim Lockett", trades: [] },
  ]);
  assert.deepEqual(plan, [
    { id: "b", fullName: "John detzler", name: "John Detzler" },
    { id: "d", fullName: "jacob hoak", name: "Jacob Hoak" },
  ]);
  // Run again on the fixed values: nothing left to do.
  assert.deepEqual(planContactFixes([{ id: "b", fullName: "John Detzler", trades: ["Painting"] }]), []);
});

test("Connor's three hand fixes: trades out of Company, the company out of a name, matched exactly (decision 31)", () => {
  const before = [
    { id: "jer", fullName: "Jeremiah Anderson", company: "Electric", trades: [] },
    { id: "kim", fullName: "Kim Lockett", company: "House Cleaner", trades: ["Cleaning"] },
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", company: "Freedom Electric", trades: ["Electric"] },
    // Same names with other values, and the same company on someone else: never touched.
    { id: "jer2", fullName: "Jeremiah Anderson", company: "Anderson Electric LLC", trades: ["Electric"] },
    { id: "kim2", fullName: "Kim lockett", company: "House Cleaner", trades: ["Cleaning"] },
    { id: "other", fullName: "Sam Sparks", company: "Electric", trades: [] },
    { id: "mike2", fullName: "Mike Morris (Freedom Electric)", company: "Morris Co", trades: [] },
  ];
  assert.deepEqual(planContactFixes(before), [
    { id: "jer", fullName: "Jeremiah Anderson", addTrade: "Electric", company: { from: "Electric", to: null } },
    // "House Cleaner" maps to Cleaning, which Kim already has: only Company changes.
    { id: "kim", fullName: "Kim Lockett", company: { from: "House Cleaner", to: null } },
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", name: "Mike Morris" },
    { id: "kim2", fullName: "Kim lockett", name: "Kim Lockett" },
  ]);
  assert.deepEqual(planContactFixes([{ id: "kim", fullName: "Kim Lockett", company: "House Cleaner", trades: [] }])[0].addTrade, "Cleaning");
  assert.deepEqual(planContactFixes([{ id: "mike", fullName: "Mike Morris (Freedom Electric)", company: null, trades: ["Electric"] }]), [
    { id: "mike", fullName: "Mike Morris (Freedom Electric)", name: "Mike Morris", company: { from: null, to: "Freedom Electric" } },
  ]);
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
