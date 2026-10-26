import test from "node:test";
import assert from "node:assert/strict";
import {
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  coverPhoto,
  movedAnnouncement,
  movedPhoto,
  movedPhotoTo,
  photoName,
  photoRoom,
  photosNeededLine,
  restoredPhoto,
  withPhoto,
  withoutPhoto,
  type ListingPhotoDraft,
} from "./listing-photo-set";

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

test("movedPhotoTo: a drop takes the target's place and the others shift over", () => {
  const set = [photo(1), photo(2), photo(3), photo(4)];
  assert.deepEqual(names(movedPhotoTo(set, 1, 3)), ["p1.jpg", "p3.jpg", "p4.jpg", "p2.jpg"], "later");
  assert.deepEqual(names(movedPhotoTo(set, 3, 1)), ["p1.jpg", "p4.jpg", "p2.jpg", "p3.jpg"], "earlier");
  assert.deepEqual(names(movedPhotoTo(set, 2, 0)), ["p3.jpg", "p1.jpg", "p2.jpg", "p4.jpg"], "onto the cover tile: it becomes the cover");
  assert.deepEqual(names(movedPhotoTo(set, 0, 3)), ["p2.jpg", "p3.jpg", "p4.jpg", "p1.jpg"], "the cover moved off the front hands it to the next");
  assert.deepEqual(names(movedPhotoTo(set, 2, 2)), names(set), "dropped where it was");
  assert.deepEqual(names(movedPhotoTo(set, 9, 0)), names(set), "a place that isn't there changes nothing");
  assert.deepEqual(names(movedPhotoTo(set, 0, -1)), names(set));
  assert.deepEqual(names(set), ["p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"], "the original set is untouched");
});

test("coverPhoto: Make cover moves it to the front and keeps everyone else's order", () => {
  const set = [photo(1), photo(2), photo(3), photo(4)];
  assert.deepEqual(names(coverPhoto(set, 2)), ["p3.jpg", "p1.jpg", "p2.jpg", "p4.jpg"]);
  assert.deepEqual(names(coverPhoto(set, 0)), names(set), "the cover is already the cover");
});

test("restoredPhoto: Undo puts a removed photo back where it was", () => {
  const before = [photo(1), photo(2), photo(3)];
  const after = withoutPhoto(before, 1);
  assert.deepEqual(names(restoredPhoto(after, before[1], 1)), names(before));
  assert.deepEqual(names(restoredPhoto(withoutPhoto(before, 0), before[0], 0)), names(before), "the cover returns as the cover");
  assert.deepEqual(names(restoredPhoto([photo(1)], photo(2), 7)), ["p1.jpg", "p2.jpg"], "a shorter set takes it last");
  assert.deepEqual(names(restoredPhoto([photo(1)], photo(2), -3)), ["p2.jpg", "p1.jpg"], "never before the front");
});

test("restoredPhoto: the 20 cap and a blob already back leave the set as it was", () => {
  const full = Array.from({ length: LISTING_PHOTO_MAX }, (_, i) => photo(i));
  assert.equal(restoredPhoto(full, photo(99), 0).length, 20);
  assert.deepEqual(names(restoredPhoto([photo(1), photo(2)], photo(2), 0)), ["p1.jpg", "p2.jpg"]);
});

test("photoRoom: how many more a listing takes, counting down to none at 20", () => {
  assert.equal(photoRoom(0), 20);
  assert.equal(photoRoom(8), 12);
  assert.equal(photoRoom(20), 0);
  assert.equal(photoRoom(25), 0);
  assert.equal(photoRoom(3, 5), 2);
});

test("the helper counts photos to go until the set is five (the brand's listing set)", () => {
  assert.equal(LISTING_PHOTO_MIN, 5);
  assert.equal(photosNeededLine(0), "Listings need 5 photos · 5 to go");
  assert.equal(photosNeededLine(3), "Listings need 5 photos · 2 to go");
  assert.equal(photosNeededLine(4), "Listings need 5 photos · 1 to go");
  assert.equal(photosNeededLine(5), null);
  assert.equal(photosNeededLine(12), null);
});

test("every photo has its own name, and a move is announced by place", () => {
  assert.equal(photoName("Unit 2", 3), "Unit 2 photo 3");
  assert.equal(photoName("  ", 1), "Listing photo 1");
  assert.equal(movedAnnouncement(2, 0), "Photo 3 moved to position 1, now the cover");
  assert.equal(movedAnnouncement(0, 2), "Photo 1 moved to position 3");
});
