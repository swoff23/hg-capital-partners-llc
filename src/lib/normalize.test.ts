import test from "node:test";
import assert from "node:assert/strict";
import { addressKey, normalizeAddress, sameStreetAddress, shortAddress, streetKey } from "./normalize";

test("normalizeAddress: lowercase, common street words, punctuation, whitespace", () => {
  assert.equal(normalizeAddress("725 Linwood Avenue, Buffalo, NY 14209"), "725 linwood ave buffalo ny 14209");
  assert.equal(normalizeAddress("118 Congress St.\nBuffalo"), "118 congress st buffalo");
  assert.equal(normalizeAddress("  23  Sherwood   Drive "), "23 sherwood dr");
  assert.equal(normalizeAddress("Apt #2, 15 Oxford Road"), "apt 2 15 oxford rd");
  assert.equal(normalizeAddress(null), "");
  assert.equal(normalizeAddress(""), "");
});

test("addressKey: leading number + street word; combined numbers keep the first", () => {
  assert.equal(addressKey("725 Linwood Avenue, Buffalo, NY 14209"), "725 linwood");
  assert.equal(addressKey("HGC 725 Linwood"), "hgc 725"); // no leading number -> first two tokens
  assert.equal(addressKey("765/767 Prospect Ave"), "765 prospect");
  assert.equal(addressKey("58 Mariner St"), "58 mariner");
  assert.equal(addressKey("15a Oxford"), "15a oxford");
  assert.equal(addressKey(""), "");
});

test("streetKey: house number, direction and street name", () => {
  assert.equal(streetKey("352 Auburn Avenue Buffalo , NY 14213"), "352 auburn");
  assert.equal(streetKey("352 Auburn Ave Buffalo 14213"), "352 auburn");
  assert.equal(streetKey("352 Auburn Ave Apt 2"), "352 auburn");
  assert.equal(streetKey("352 Auburn, Buffalo"), "352 auburn"); // no street type: first word
  // A direction before the name is kept, spelled or not, so East and West never meet.
  assert.equal(streetKey("421 W Delavan Ave"), "421 w delavan");
  assert.equal(streetKey("421 West Delavan Avenue, Buffalo"), "421 w delavan");
  assert.equal(streetKey("421 E. Delavan"), "421 e delavan");
  // ...unless it is the name itself.
  assert.equal(streetKey("971 West Avenue"), "971 west");
  assert.equal(streetKey("971 W Ave, Buffalo, NY"), "971 west");
  // Multi-word names run up to the street type.
  assert.equal(streetKey("1500 Niagara Falls Blvd"), "1500 niagara falls");
  assert.equal(streetKey("1500 Niagara St"), "1500 niagara");
  assert.equal(streetKey("893 Columbus Parkway"), "893 columbus");
  assert.equal(streetKey("893 Columbus Pkwy Buffalo NY 14213"), "893 columbus");
  // A street-type word that opens the name is the name.
  assert.equal(streetKey("12 Court St"), "12 court");
  // Combined numbers keep the first.
  assert.equal(streetKey("765/767 Prospect Ave"), "765 prospect");
  assert.equal(streetKey("765-767 Prospect Ave"), "765 prospect");
  // No leading number: the whole normalized address.
  assert.equal(streetKey("Lot on Main Street"), "lot on main st");
  assert.equal(streetKey("12"), "12");
  assert.equal(streetKey(""), "");
  assert.equal(streetKey(null), "");
});

test("sameStreetAddress: one building typed two ways", () => {
  assert.ok(sameStreetAddress("352 Auburn Avenue Buffalo , NY 14213", "352 Auburn Ave Buffalo 14213"));
  assert.ok(sameStreetAddress("348 Virginia St", "348 Virginia Street, Buffalo, NY 14201"));
  assert.ok(sameStreetAddress("421 W Delavan", "421 West Delavan Ave"));
  assert.ok(sameStreetAddress("971 West Avenue", "971 West Ave, Buffalo, NY 14213"));
  // Different buildings.
  assert.equal(sameStreetAddress("421 W Delavan Ave", "421 E Delavan Ave"), false);
  assert.equal(sameStreetAddress("352 Auburn Ave", "353 Auburn Ave"), false);
  assert.equal(sameStreetAddress("352 Auburn Ave", "1352 Auburn Ave"), false);
  assert.equal(sameStreetAddress("1500 Niagara St", "1500 Niagara Falls Blvd"), false);
  // Two different ZIPs are two places; a missing one doesn't count against.
  assert.equal(sameStreetAddress("100 Main St, Buffalo, NY 14201", "100 Main St, Williamsville, NY 14221"), false);
  assert.ok(sameStreetAddress("100 Main St, Buffalo, NY 14201", "100 Main St"));
  assert.ok(sameStreetAddress("100 Main St 14201-1234", "100 Main St Buffalo 14201"));
  // Two street types must agree, in any spelling.
  assert.equal(sameStreetAddress("100 Main St", "100 Main Ave"), false);
  assert.equal(sameStreetAddress("100 Delaware Ave, Buffalo, NY 14202", "100 Delaware Rd, Kenmore"), false);
  assert.equal(sameStreetAddress("100 Main St 14201", "100 Main Ave 14201"), false);
  assert.ok(sameStreetAddress("893 Columbus Parkway", "893 Columbus Pkwy, Buffalo"));
  assert.ok(sameStreetAddress("12 Oak Ct", "12 Oak Court"));
  assert.ok(sameStreetAddress("12 Oak Av", "12 Oak Avenue"));
  // Without two ZIPs, two named towns must agree.
  assert.equal(sameStreetAddress("100 Main St, Buffalo", "100 Main St, Williamsville"), false);
  assert.equal(sameStreetAddress("100 Main St, Buffalo, NY 14201", "100 Main St Williamsville"), false);
  assert.equal(sameStreetAddress("352 Auburn, Buffalo", "352 Auburn, Kenmore"), false);
  assert.ok(sameStreetAddress("100 Main St, Buffalo", "100 Main St Buffalo NY"));
  assert.ok(sameStreetAddress("100 Main St Apt 2, Buffalo, N.Y.", "100 Main Street Upper, Buffalo, New York"));
  assert.ok(sameStreetAddress("100 Main St, N Tonawanda", "100 Main St, North Tonawanda, NY"));
  assert.ok(sameStreetAddress("100 Main St, West Seneca", "100 Main St"));
  // Matching ZIPs decide, even when the towns are written differently.
  assert.ok(sameStreetAddress("100 Main St, Amherst, NY 14221", "100 Main St, Williamsville, NY 14221"));
  // A five-digit house number isn't a ZIP.
  assert.ok(sameStreetAddress("10450 Main St", "10450 Main Street, Clarence"));
  // No number: only an exact (normalized) match.
  assert.ok(sameStreetAddress("Lot on Main St.", "lot on main street"));
  assert.equal(sameStreetAddress("Lot on Main St", "Lot on Main St, Buffalo"), false);
  assert.equal(sameStreetAddress("", ""), false);
  assert.equal(sameStreetAddress(null, "352 Auburn Ave"), false);
});

test("shortAddress strips the city/state tail", () => {
  assert.equal(shortAddress("725 Linwood Avenue, Buffalo, NY 14209"), "725 Linwood Avenue");
  assert.equal(shortAddress("118 Congress St Buffalo NY 14213"), "118 Congress St");
  assert.equal(shortAddress("58 Mariner St"), "58 Mariner St");
  assert.equal(shortAddress(null), "");
});
