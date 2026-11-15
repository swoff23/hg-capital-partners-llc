import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadLatestListing } from "./listing-latest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const listing = (rent: string, photos: string[] = []) => ({
  id: "l1",
  unitLabel: "Unit 1",
  rent,
  photos: photos.map((pathname) => ({ pathname, url: `https://blob/${pathname}` })),
});

test("a listing nobody else touched keeps the draft, photos included, and the base stays as it was", () => {
  const opened = listing("1200", ["a"]);
  const draft = { ...listing("1250", ["a", "b", "c"]) };
  const r = loadLatestListing(opened, listing("1200", ["a"]), draft);
  assert.equal(r.reset, false);
  assert.equal(r.draft, draft, "the very draft, not a copy");
  assert.deepEqual(r.base, opened);
});

test("a listing that changed meanwhile starts the sheet over on it, so a save can't write over that change", () => {
  const opened = listing("1200", ["a"]);
  const latest = listing("1300", ["a", "z"]);
  const draft = listing("1250", ["a", "b"]);
  const r = loadLatestListing(opened, latest, draft);
  assert.equal(r.reset, true);
  assert.deepEqual(r.draft, latest);
  assert.notEqual(r.draft, latest, "a copy: editing the draft never edits the page's listing");
  assert.deepEqual(r.base, latest);
});

test("the same photos in another order count as a change", () => {
  assert.equal(loadLatestListing(listing("1", ["a", "b"]), listing("1", ["b", "a"]), listing("1", ["a", "b"])).reset, true);
});

test("a new listing, which has no latest, always keeps what was typed", () => {
  const blank = { id: null, unitLabel: "", rent: "", photos: [] };
  const draft = { ...blank, unitLabel: "Unit 2", photos: [{ pathname: "p", url: "u" }] };
  const r = loadLatestListing(blank, { ...blank }, draft);
  assert.equal(r.reset, false);
  assert.equal(r.draft, draft);
});

test("the listing sheet offers Load the latest after a conflict, pins the page's version and keeps the unit sheet's gone case", () => {
  const sheet = read("../../app/(app)/properties/[id]/listing-sheet.tsx");
  assert.match(sheet, /errorAction=\{run\.conflict && <LoadLatest onClick=\{loadLatest\} \/>\}/);
  assert.match(sheet, /savePropertyListing\(propertyId, draft, pinned\)/);
  assert.match(sheet, /loadLatestListing\(base, listing, draft\)/);
  assert.match(sheet, /dirty=\{stableJson\(draft\) !== stableJson\(base\)\}/);
  const parent = read("../../app/(app)/properties/[id]/edit-listings.tsx");
  assert.match(parent, /latest=\{version\}/);
  assert.match(parent, /gone=\{/);
  // What the sheet does with the answer (the lines a changed listing, a gone one and a pin depend on).
  assert.match(sheet, /const \[pinned, setPinned\] = useState\(version\);/);
  assert.match(sheet, /if \(gone\) \{\s*void discardSessionUploads\(propertyId\);\s*onOpenChange\(false\);\s*return;\s*\}/);
  assert.match(sheet, /const next = loadLatestListing\(base, listing, draft\);\s*setBase\(next\.base\);\s*setPinned\(latest\);\s*if \(next\.reset\) \{[\s\S]*?setDraft\(next\.draft\);/);
  // Tapped before the page behind has refreshed: keep the line and the draft, ask for the page.
  assert.match(sheet, /if \(!gone && latest === pinned\) \{\s*router\.refresh\(\);\s*return;\s*\}/);
  assert.match(parent, /gone=\{sheet\.listingId !== null && !editing\}/);
  assert.match(parent, /initial\.find\(\(l\) => l\.id === sheet\.listingId\)/);
  assert.match(parent, /setSheet\(\{ listingId: [^\n]*, version, id: /);
});
