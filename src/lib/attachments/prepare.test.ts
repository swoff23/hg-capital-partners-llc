import test from "node:test";
import assert from "node:assert/strict";
import { uploadNotice } from "./media";
import {
  DISPLAY_EDGE,
  DISPLAY_QUALITY,
  NOT_A_PHOTO,
  NOT_A_VIDEO,
  SNIFF_BYTES,
  THUMB_EDGE,
  THUMB_QUALITY,
  UNREADABLE_PHOTO,
  fitWithin,
  heicFallbackApplies,
  looksLikeMedia,
  planPrepare,
} from "./prepare";

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

/* ---------------- Files that aren't the photo or video they're named as ---------------- */

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

test("looksLikeMedia: the photos and videos an upload takes pass, even ones a desktop browser can't decode", () => {
  assert.equal(looksLikeMedia(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF"), "image"), true, "JPEG");
  assert.equal(looksLikeMedia(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]), "image"), true, "PNG");
  assert.equal(looksLikeMedia(bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "), "image"), true, "WebP");
  assert.equal(looksLikeMedia(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]), "image"), true, "an iPhone HEIC");
  assert.equal(looksLikeMedia(bytes([0, 0, 0, 0x18], "ftypmif1", [0, 0, 0, 0]), "image"), true, "HEIF");
  assert.equal(looksLikeMedia(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0]), "video"), true, "an iPhone MOV");
  assert.equal(looksLikeMedia(bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 2, 0]), "video"), true, "MP4");
  assert.equal(looksLikeMedia(bytes([0, 0, 0, 8], "wide", [0, 0, 0, 0]), "video"), true, "an older MOV");
  assert.equal(looksLikeMedia(bytes([0, 0, 0x6b, 0x2c], "moov"), "video"), true, "moov first");
});

test("looksLikeMedia: a PDF, SVG markup or noise named as a photo or a video is neither", () => {
  assert.equal(looksLikeMedia(bytes("%PDF-1.7\n%"), "image"), false, "receipt.jpg");
  assert.equal(looksLikeMedia(bytes('<svg xmlns="http'), "image"), false, "logo.jpg");
  assert.equal(looksLikeMedia(bytes([0x3c, 0x3f], "xml version"), "image"), false);
  assert.equal(looksLikeMedia(bytes([0x9a, 0x11, 0x42, 0x07, 0xee, 0x31, 0x5c, 0x80, 0x01, 0x02, 0x03, 0x04]), "image"), false, "IMG_1234.HEIC");
  assert.equal(looksLikeMedia(bytes([0x9a, 0x11, 0x42, 0x07, 0xee, 0x31, 0x5c, 0x80]), "video"), false, "walkthrough.mp4");
  assert.equal(looksLikeMedia(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF"), "video"), false, "a JPEG named .mov");
  assert.equal(looksLikeMedia(bytes("%PDF-1.7"), "video"), false);
  assert.equal(looksLikeMedia(new Uint8Array(0), "image"), false, "nothing to read");
});

test("the reasons a file gives when it isn't what it's named as are one short clause", () => {
  assert.equal(NOT_A_PHOTO, "the file isn't a photo");
  assert.equal(NOT_A_VIDEO, "the file isn't a video");
  assert.equal(SNIFF_BYTES >= 12, true, "enough for a WebP's RIFF header");
  assert.equal(uploadNotice([{ name: "receipt.jpg", kind: "image", reason: NOT_A_PHOTO }]), "1 photo didn't upload: the file isn't a photo");
});
