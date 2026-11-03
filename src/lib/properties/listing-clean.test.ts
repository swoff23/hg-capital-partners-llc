import test from "node:test";
import assert from "node:assert/strict";
import { FieldError } from "@/lib/action-result";
import { URL_MESSAGE } from "@/lib/inline-edit";
import { cleanListing, type ListingInput } from "./listing-clean";
import { listingLinkProblem, listingProblems } from "./listing-checks";

const L = (over: Partial<ListingInput> = {}): ListingInput => ({
  id: null,
  unitLabel: "Lower",
  zillowUrl: "",
  rent: "",
  beds: "",
  baths: "",
  sqft: "",
  availableDate: "",
  status: "HIDDEN",
  photos: [],
  ...over,
});

function refusal(l: ListingInput): Record<string, string> | null {
  try {
    cleanListing(l);
    return null;
  } catch (err) {
    assert.ok(err instanceof FieldError, "a refusal is a FieldError, which the sheet shows on the field");
    return err.fieldErrors;
  }
}

test("a Zillow link that isn't http(s) is refused on the field, so the public Rentals page never links to it", () => {
  // The sheet checked this; the server stored whatever was sent, and /rentals renders it as the href.
  assert.deepEqual(refusal(L({ zillowUrl: "javascript:alert(1)" })), { zillowUrl: URL_MESSAGE });
  assert.deepEqual(refusal(L({ zillowUrl: "zillow.com/x" })), { zillowUrl: URL_MESSAGE });
  assert.deepEqual(refusal(L({ zillowUrl: "www.zillow.com/homedetails/1" })), { zillowUrl: URL_MESSAGE });
  assert.deepEqual(refusal(L({ zillowUrl: "data:text/html,<b>x</b>" })), { zillowUrl: URL_MESSAGE });
  assert.deepEqual(refusal(L({ zillowUrl: "ftp://zillow.com/x" })), { zillowUrl: URL_MESSAGE });
  assert.deepEqual(refusal(L({ zillowUrl: "https://zillow.com/a b" })), { zillowUrl: URL_MESSAGE });
});

test("a Zillow link that reads is kept as typed (trimmed), and a blank clears it", () => {
  assert.equal(cleanListing(L({ zillowUrl: "  https://www.zillow.com/homedetails/1_zpid/ " })).zillowUrl, "https://www.zillow.com/homedetails/1_zpid/");
  assert.equal(cleanListing(L({ zillowUrl: "http://zillow.com/x" })).zillowUrl, "http://zillow.com/x");
  assert.equal(cleanListing(L({ zillowUrl: "   " })).zillowUrl, null);
  assert.equal(cleanListing(L()).zillowUrl, null);
});

test("the link's line is the sheet's, and it comes with the other fields' lines", () => {
  assert.equal(listingLinkProblem("javascript:alert(1)"), URL_MESSAGE);
  assert.equal(listingLinkProblem(""), null);
  const fields = { unitLabel: "Lower", zillowUrl: "zillow.com/x", rent: "", sqft: "", beds: "", baths: "" };
  assert.equal(listingProblems(fields, fields).zillowUrl, URL_MESSAGE, "the sheet and the server say the same thing");
  // Rent and sq ft are still checked beside it.
  assert.deepEqual(refusal(L({ zillowUrl: "zillow.com/x", rent: "abc", sqft: "12.5.1" })), {
    zillowUrl: URL_MESSAGE,
    rent: "Enter an amount, like 1,500.",
    sqft: "Enter a whole number.",
  });
});

test("the rest of a listing is read as it was: a blank unit is Unit, the photo set keeps its order", () => {
  const clean = cleanListing(
    L({
      unitLabel: " ",
      rent: "1,500",
      sqft: "900",
      beds: " 2 ",
      photos: [
        { url: " https://blob.test/a.jpg ", pathname: "a.jpg" },
        { url: "", pathname: "gone.jpg" },
        { url: "https://blob.test/b.jpg", pathname: "b.jpg" },
      ],
    }),
  );
  assert.equal(clean.unitLabel, "Unit");
  assert.equal(String(clean.rent), "1500.00");
  assert.equal(String(clean.sqft), "900");
  assert.equal(clean.beds, "2");
  assert.deepEqual(clean.photos, [
    { url: "https://blob.test/a.jpg", pathname: "a.jpg", sortOrder: 0 },
    { url: "https://blob.test/b.jpg", pathname: "b.jpg", sortOrder: 1 },
  ]);
});
