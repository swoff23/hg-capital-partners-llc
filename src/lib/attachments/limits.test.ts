import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_RULE, UPLOAD_RULES } from "./content-types";
import { durationHint, mediaHint, pixelHint, uploadLimits } from "./limits";

const T = "cm1abc2def3ghi";
const limits = (pathname: string, fileKind: unknown) => uploadLimits(T, pathname, fileKind);

test("uploadLimits: an original gets its kind's allowlist and cap", () => {
  for (const kind of ["image", "video", "file"] as const) {
    const name = { image: "a.jpg", video: "a.mov", file: "a.pdf" }[kind];
    assert.deepEqual(limits(`tasks/${T}/orig/${name}`, kind), {
      maximumSizeInBytes: UPLOAD_RULES[kind].maxBytes,
      allowedContentTypes: [...UPLOAD_RULES[kind].contentTypes],
    });
  }
});

test("uploadLimits: thumbs and posters are stills, never HEIC, and must say image", () => {
  for (const role of ["thumb", "poster"]) {
    const l = limits(`tasks/${T}/${role}/a.jpg`, "image");
    assert.notEqual(typeof l, "string");
    if (typeof l === "string") return;
    assert.deepEqual(l.allowedContentTypes, [...PREVIEW_RULE.contentTypes]);
    assert.equal(l.allowedContentTypes.includes("image/heic"), false);
    assert.equal(typeof limits(`tasks/${T}/${role}/a.jpg`, "video"), "string");
    assert.equal(typeof limits(`tasks/${T}/${role}/a.jpg`, "file"), "string");
    assert.equal(typeof limits(`tasks/${T}/${role}/a.heic`, "image"), "string");
  }
});

test("uploadLimits: refuses an unknown fileKind and another task's path", () => {
  for (const k of [undefined, null, "", "svg", "IMAGE", "__proto__", 1, {}]) {
    assert.equal(typeof limits(`tasks/${T}/orig/a.jpg`, k), "string", String(k));
  }
  assert.equal(typeof limits("tasks/other/orig/a.jpg", "image"), "string");
  assert.equal(typeof limits(`tasks/${T}/a.jpg`, "image"), "string");
  assert.equal(typeof limits(`tasks/${T}/orig/../x.jpg`, "image"), "string");
});

test("uploadLimits: an extension must name a type its kind allows", () => {
  assert.equal(typeof limits(`tasks/${T}/orig/payload.html`, "file"), "string");
  assert.equal(typeof limits(`tasks/${T}/orig/setup.exe`, "file"), "string");
  assert.equal(typeof limits(`tasks/${T}/orig/clip.jpg`, "video"), "string");
  assert.equal(typeof limits(`tasks/${T}/orig/photo.pdf`, "image"), "string");
  assert.equal(typeof limits(`tasks/${T}/orig/notes.txt`, "file"), "object");
  assert.equal(typeof limits(`tasks/${T}/orig/IMG_1.HEIC`, "image"), "object");
  // No extension, or a numeric one, isn't a claim about the type.
  assert.equal(typeof limits(`tasks/${T}/orig/README`, "file"), "object");
  assert.equal(typeof limits(`tasks/${T}/orig/bid-v1.2`, "file"), "object");
});

test("display hints keep only sane positive numbers", () => {
  for (const bad of [Number.NaN, 0, -1, Infinity, null, undefined]) {
    assert.equal(mediaHint(bad, 10), null, String(bad));
    assert.equal(pixelHint(bad), null, String(bad));
    assert.equal(durationHint(bad), null, String(bad));
  }
  assert.equal(mediaHint(11, 10), null);
  assert.equal(mediaHint(10, 10), 10);
  assert.equal(pixelHint(20001), null);
  assert.equal(pixelHint(1023.6), 1024);
  assert.equal(durationHint(12.5), 12.5);
  assert.equal(durationHint(24 * 3600 + 1), null);
});
