import test from "node:test";
import assert from "node:assert/strict";
import { listingPill } from "./listing-pill";

const TODAY = "2026-11-20";

test("a leased listing reads Leased, dated or not", () => {
  assert.equal(listingPill("LEASED", null, TODAY), "Leased");
  assert.equal(listingPill("LEASED", "2027-01-15", TODAY), "Leased");
});

test("an available listing shows its day only while it's ahead", () => {
  assert.equal(listingPill("AVAILABLE", "2026-12-01", TODAY), "Available Dec 1");
  assert.equal(listingPill("AVAILABLE", "2026-11-21", TODAY), "Available Nov 21");
  // Next year's day names its year, as fmtDay's "auto" does.
  assert.equal(listingPill("AVAILABLE", "2027-01-15", TODAY), "Available Jan 15, 2027");
  // Today, a day gone by, or no date: open now, so no pill.
  assert.equal(listingPill("AVAILABLE", TODAY, TODAY), undefined);
  assert.equal(listingPill("AVAILABLE", "2026-11-01", TODAY), undefined);
  assert.equal(listingPill("AVAILABLE", null, TODAY), undefined);
  assert.equal(listingPill("AVAILABLE", undefined, TODAY), undefined);
});

test("an available listing reads a stored date (UTC midnight) as its calendar day", () => {
  assert.equal(listingPill("AVAILABLE", new Date(Date.UTC(2026, 11, 1)), TODAY), "Available Dec 1");
});

test("a coming-soon listing with a date names its month", () => {
  assert.equal(listingPill("COMING_SOON", "2027-01-15", TODAY), "Coming in January");
  assert.equal(listingPill("COMING_SOON", "2026-12-01", TODAY), "Coming in December");
  assert.equal(listingPill("COMING_SOON", new Date(Date.UTC(2027, 0, 15)), TODAY), "Coming in January");
});

test("the month shows through its last day, then the pill falls back to Coming soon", () => {
  // This month, its day already gone by: still this month.
  assert.equal(listingPill("COMING_SOON", "2026-11-03", TODAY), "Coming in November");
  assert.equal(listingPill("COMING_SOON", "2027-01-15", "2027-01-31"), "Coming in January");
  assert.equal(listingPill("COMING_SOON", "2027-01-15", "2027-02-01"), "Coming soon");
  assert.equal(listingPill("COMING_SOON", "2026-10-31", TODAY), "Coming soon");
  // Across a new year.
  assert.equal(listingPill("COMING_SOON", "2026-12-20", "2026-12-31"), "Coming in December");
  assert.equal(listingPill("COMING_SOON", "2026-12-20", "2027-01-01"), "Coming soon");
});

test("a month 12 or more ahead names its year", () => {
  // 11 months ahead: October can only mean next October.
  assert.equal(listingPill("COMING_SOON", "2027-10-01", TODAY), "Coming in October");
  // 12 ahead: November alone would read as this month.
  assert.equal(listingPill("COMING_SOON", "2027-11-01", TODAY), "Coming in November 2027");
  assert.equal(listingPill("COMING_SOON", "2028-01-10", TODAY), "Coming in January 2028");
});

test("a coming-soon listing with no date, or a date that doesn't read, is Coming soon", () => {
  assert.equal(listingPill("COMING_SOON", null, TODAY), "Coming soon");
  assert.equal(listingPill("COMING_SOON", undefined, TODAY), "Coming soon");
  assert.equal(listingPill("COMING_SOON", "", TODAY), "Coming soon");
  assert.equal(listingPill("COMING_SOON", "soon", TODAY), "Coming soon");
});

test("a hidden listing has no pill", () => {
  assert.equal(listingPill("HIDDEN", null, TODAY), undefined);
  assert.equal(listingPill("HIDDEN", "2026-12-01", TODAY), undefined);
});
