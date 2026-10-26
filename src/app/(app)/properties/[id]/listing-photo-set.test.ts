import test from "node:test";
import assert from "node:assert/strict";
import { LISTING_PHOTO_MAX, movedPhoto, withPhoto, withoutPhoto, type ListingPhotoDraft } from "./listing-photo-set";

const photo = (n: number): ListingPhotoDraft => ({ url: `https://x.public.blob.vercel-storage.com/p${n}.jpg`, pathname: `p${n}.jpg` });
const names = (set: readonly ListingPhotoDraft[]) => set.map((p) => p.pathname);

test("withPhoto: adds last, so the first stays the cover", () => {
  assert.deepEqual(names(withPhoto([photo(1)], photo(2))), ["p1.jpg", "p2.jpg"]);
  assert.deepEqual(names(withPhoto([], photo(1))), ["p1.jpg"]);
});

test("withPhoto: the 20 cap, and a blob already in the set, leave it as it was", () => {
  const full = Array.from({ length: LISTING_PHOTO_MAX }, (_, i) => photo(i));
  assert.equal(LISTING_PHOTO_MAX, 20);
  assert.equal(withPhoto(full, photo(99)).length, 20);
  assert.deepEqual(names(withPhoto([photo(1)], photo(1))), ["p1.jpg"]);
  assert.equal(withPhoto([photo(1), photo(2)], photo(3), 2).length, 2, "a smaller cap holds too");
});

test("withPhoto: concurrent uploads each land when every add starts from the latest set", () => {
  let set: ListingPhotoDraft[] = [];
  for (const n of [1, 2, 3]) set = withPhoto(set, photo(n));
  assert.deepEqual(names(set), ["p1.jpg", "p2.jpg", "p3.jpg"]);
});

test("withoutPhoto: drops one photo; removing the cover makes the next one the cover", () => {
  assert.deepEqual(names(withoutPhoto([photo(1), photo(2), photo(3)], 0)), ["p2.jpg", "p3.jpg"]);
  assert.deepEqual(names(withoutPhoto([photo(1), photo(2)], 5)), ["p1.jpg", "p2.jpg"]);
});

test("movedPhoto: one place earlier or later; moving to the front makes it the cover", () => {
  const set = [photo(1), photo(2), photo(3)];
  assert.deepEqual(names(movedPhoto(set, 1, -1)), ["p2.jpg", "p1.jpg", "p3.jpg"]);
  assert.deepEqual(names(movedPhoto(set, 1, 1)), ["p1.jpg", "p3.jpg", "p2.jpg"]);
  assert.deepEqual(names(movedPhoto(set, 0, -1)), ["p1.jpg", "p2.jpg", "p3.jpg"], "the first stays first");
  assert.deepEqual(names(movedPhoto(set, 2, 1)), ["p1.jpg", "p2.jpg", "p3.jpg"], "the last stays last");
  assert.deepEqual(names(set), ["p1.jpg", "p2.jpg", "p3.jpg"], "the original set is untouched");
});
