import test from "node:test";
import assert from "node:assert/strict";
import { DISPLAY_EDGE, DISPLAY_QUALITY, THUMB_EDGE, THUMB_QUALITY, UNREADABLE_PHOTO, fitWithin, heicFallbackApplies, planPrepare } from "./prepare";

test("the sizes the spec names: a 2560px display JPEG at 0.85, a 1024px thumbnail", () => {
  assert.equal(DISPLAY_EDGE, 2560);
  assert.equal(DISPLAY_QUALITY, 0.85);
  assert.equal(THUMB_EDGE, 1024);
  assert.ok(THUMB_QUALITY > 0 && THUMB_QUALITY <= 1);
});

test("fitWithin: the long edge fits, the other follows, rounded to whole pixels", () => {
  // A 12 MP iPhone photo, landscape and portrait.
  assert.deepEqual(fitWithin(4032, 3024, DISPLAY_EDGE), { width: 2560, height: 1920 });
  assert.deepEqual(fitWithin(3024, 4032, DISPLAY_EDGE), { width: 1920, height: 2560 });
  assert.deepEqual(fitWithin(4032, 3024, THUMB_EDGE), { width: 1024, height: 768 });
  assert.deepEqual(fitWithin(3024, 4032, THUMB_EDGE), { width: 768, height: 1024 });
  // 48 MP.
  assert.deepEqual(fitWithin(8064, 6048, DISPLAY_EDGE), { width: 2560, height: 1920 });
  // A wide panorama: the short side rounds, never below 1.
  assert.deepEqual(fitWithin(12000, 3000, DISPLAY_EDGE), { width: 2560, height: 640 });
  assert.deepEqual(fitWithin(40000, 10, THUMB_EDGE), { width: 1024, height: 1 });
  assert.deepEqual(fitWithin(1000, 1000, 333), { width: 333, height: 333 });
  assert.deepEqual(fitWithin(1000, 999, 500), { width: 500, height: 500 });
});

test("fitWithin: never upscales", () => {
  assert.deepEqual(fitWithin(800, 600, DISPLAY_EDGE), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(2560, 1440, DISPLAY_EDGE), { width: 2560, height: 1440 });
  assert.deepEqual(fitWithin(640, 480, THUMB_EDGE), { width: 640, height: 480 });
  assert.deepEqual(fitWithin(0, 0, THUMB_EDGE), { width: 1, height: 1 });
});

test("planPrepare: previews only where the record step keeps them, the display JPEG only for display photos", () => {
  // Task files keep a thumbnail and a poster.
  assert.deepEqual(planPrepare({ fileKind: "image", mode: "original", previews: true }), { thumb: true, poster: false, display: false });
  assert.deepEqual(planPrepare({ fileKind: "video", mode: "original", previews: true }), { thumb: false, poster: true, display: false });
  // A contractor's photo: thumbnail and the 2560px JPEG; their video stays as shot.
  assert.deepEqual(planPrepare({ fileKind: "image", mode: "display", previews: true }), { thumb: true, poster: false, display: true });
  assert.deepEqual(planPrepare({ fileKind: "video", mode: "display", previews: true }), { thumb: false, poster: true, display: false });
  // A listing photo or the property photo: the JPEG alone, no thumbnail to store.
  assert.deepEqual(planPrepare({ fileKind: "image", mode: "display", previews: false }), { thumb: false, poster: false, display: true });
  // Property documents and staff documents.
  assert.deepEqual(planPrepare({ fileKind: "image", mode: "original", previews: false }), { thumb: false, poster: false, display: false });
  assert.deepEqual(planPrepare({ fileKind: "file", mode: "display", previews: true }), { thumb: false, poster: false, display: false });
});

test("the HEIC fallback is for photos going public only, never a contractor's private photo", () => {
  const listing = planPrepare({ fileKind: "image", mode: "display", previews: false });
  const contractor = planPrepare({ fileKind: "image", mode: "display", previews: true });
  const staffTask = planPrepare({ fileKind: "image", mode: "original", previews: true });
  assert.equal(heicFallbackApplies(listing, true), true);
  assert.equal(heicFallbackApplies(contractor, false), false, "a 3 MB chunk over a phone's data");
  assert.equal(heicFallbackApplies(staffTask, false), false);
  assert.equal(heicFallbackApplies(staffTask, true), false, "nothing to re-encode");
});

test("the reason a public photo gives when it can't be re-encoded is one short clause", () => {
  assert.equal(UNREADABLE_PHOTO, "this photo can't be read here. Try a JPEG");
});
