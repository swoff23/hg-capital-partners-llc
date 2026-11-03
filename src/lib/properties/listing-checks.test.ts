import test from "node:test";
import assert from "node:assert/strict";
import { listingProblems, type ListingFields } from "./listing-checks";

const L = (over: Partial<ListingFields> = {}): ListingFields => ({
  unitLabel: "Unit 1",
  zillowUrl: "",
  rent: "",
  sqft: "",
  beds: "",
  baths: "",
  ...over,
});

test("listingProblems: rent's line gives a monthly example, as the server's does", () => {
  // The sheet used to say "Enter an amount, like 425,000." for a per-month rent of -100.
  assert.equal(listingProblems(L({ rent: "-100" }), L()).rent, "Enter an amount, like 1,500.");
  assert.equal(listingProblems(L({ rent: "abc" }), L()).rent, "Enter an amount, like 1,500.");
  assert.equal(listingProblems(L({ rent: "1,500" }), L()).rent, undefined);
});

test("listingProblems: rent and sq ft too large for their columns say the limit", () => {
  assert.equal(listingProblems(L({ rent: "100,000,000" }), L()).rent, "Keep it under $100 million.");
  assert.equal(listingProblems(L({ sqft: "99999999999" }), L()).sqft, "Keep it under 10,000,000.");
  assert.deepEqual(listingProblems(L({ rent: "99,999,999.99", sqft: "1,200" }), L()), {});
});

test("listingProblems: a unit is required, and stored beds and baths are left as they are", () => {
  assert.equal(listingProblems(L({ unitLabel: " " }), L()).unitLabel, "Choose a unit.");
  const stored = L({ beds: "Studio" });
  assert.equal(listingProblems(stored, stored).beds, undefined);
  assert.equal(listingProblems(L({ beds: "Two" }), stored).beds, "Enter a whole number.");
});
