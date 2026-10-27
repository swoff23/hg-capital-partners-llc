import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_RULE, UPLOAD_RULES } from "./content-types";
import { PUBLIC_PHOTO_RULE, durationHint, mediaHint, pixelHint, propertyUploadLimits, storedPropertyDocumentPath, uploadLimits } from "./limits";
import { UPLOAD_KINDS, UPLOAD_KIND_ALLOWED } from "./upload-kinds";

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

test("uploadLimits: a contractor's kind takes photos and videos only, a document is refused at the token", () => {
  const portal = UPLOAD_KIND_ALLOWED["portal-task-upload"];
  for (const [kind, name] of [["image", "a.jpg"], ["video", "a.mov"]] as const) {
    assert.notEqual(typeof uploadLimits(T, `tasks/${T}/orig/${name}`, kind, portal), "string", kind);
  }
  // A PDF, a DOCX, a CSV or a TXT can't be put on a job as a shared file.
  for (const name of ["lease.pdf", "bid.docx", "costs.csv", "notes.txt", "README"]) {
    assert.equal(typeof uploadLimits(T, `tasks/${T}/orig/${name}`, "file", portal), "string", name);
  }
  // Their thumbnails and posters are images, which the kind takes.
  assert.notEqual(typeof uploadLimits(T, `tasks/${T}/thumb/a.jpg`, "image", portal), "string");
  // Staff task uploads take all three, and with no list nothing changes.
  assert.notEqual(typeof uploadLimits(T, `tasks/${T}/orig/lease.pdf`, "file", UPLOAD_KIND_ALLOWED["task-upload"]), "string");
  assert.notEqual(typeof uploadLimits(T, `tasks/${T}/orig/lease.pdf`, "file"), "string");
});

/* ---------------- UPLOAD_RULES per target ---------------- */

const P = "cm9prop8erty7";

test("UPLOAD_RULES per target: the caps each kind of file carries, and the kinds each upload target takes", () => {
  const MB = 1024 * 1024;
  assert.equal(UPLOAD_RULES.image.maxBytes, 25 * MB);
  assert.equal(UPLOAD_RULES.file.maxBytes, 50 * MB);
  assert.equal(UPLOAD_RULES.video.maxBytes, 500 * MB);
  // Property documents take documents up to 50 MB and photos up to 25 MB; every target names what it takes.
  for (const k of UPLOAD_KINDS) assert.ok(UPLOAD_KIND_ALLOWED[k].length > 0, k);
  assert.ok(!UPLOAD_KIND_ALLOWED["property-upload"].includes("video"), "no video on a property");
  assert.ok(!UPLOAD_KIND_ALLOWED["listing-photo-upload"].includes("file"), "photos only on the public site");
});

test("propertyUploadLimits: property documents get the cap of what they are", () => {
  const doc = propertyUploadLimits("property-upload", P, `properties/${P}/Lease-2026.pdf`, "file");
  assert.deepEqual(doc, { maximumSizeInBytes: UPLOAD_RULES.file.maxBytes, allowedContentTypes: [...UPLOAD_RULES.file.contentTypes] });
  const photo = propertyUploadLimits("property-upload", P, `properties/${P}/Insurance-card.jpg`, "image");
  assert.deepEqual(photo, { maximumSizeInBytes: UPLOAD_RULES.image.maxBytes, allowedContentTypes: [...UPLOAD_RULES.image.contentTypes] });
});

test("propertyUploadLimits: another property's path, a made-up kind and a name that lies are refused", () => {
  const refused = (v: unknown) => typeof v === "string";
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/other/a.pdf`, "file")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/a/b.pdf`, "file")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/../x.pdf`, "file")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/a b.pdf`, "file")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/a.pdf`, "video")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/a.pdf`, undefined)));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/payload.html`, "file")));
  assert.ok(refused(propertyUploadLimits("property-upload", P, `properties/${P}/scan.pdf`, "image")));
  assert.ok(refused(propertyUploadLimits("property-upload", "bad/id", `properties/bad/id/a.pdf`, "file")));
});

test("propertyUploadLimits: public photos are photos only, 25 MB, with no HEIC for the site to choke on", () => {
  for (const [kind, pathname] of [
    ["listing-photo-upload", "IMG_6117.jpg"],
    ["property-photo-upload", `properties/${P}/photo/front.webp`],
  ] as const) {
    const l = propertyUploadLimits(kind, P, pathname);
    assert.deepEqual(l, { maximumSizeInBytes: 25 * 1024 * 1024, allowedContentTypes: [...PUBLIC_PHOTO_RULE.contentTypes] });
    assert.ok(!(l as { allowedContentTypes: string[] }).allowedContentTypes.includes("image/heic"));
  }
  // The listing photo manager uploads through the queue, so a listing blob is its stored name's slug and nothing else.
  assert.equal(typeof propertyUploadLimits("listing-photo-upload", P, "photo-2026-10-25-214pm-2.jpg"), "object");
  assert.ok(typeof propertyUploadLimits("listing-photo-upload", P, "IMG_6117 (2).jpg") === "string", "a raw file name");
  assert.ok(typeof propertyUploadLimits("listing-photo-upload", P, "a/b.jpg") === "string");
  assert.ok(typeof propertyUploadLimits("listing-photo-upload", P, "..") === "string");
  assert.ok(typeof propertyUploadLimits("listing-photo-upload", P, "") === "string");
  assert.ok(typeof propertyUploadLimits("listing-photo-upload", P, "a\u0000.jpg") === "string");
  assert.ok(typeof propertyUploadLimits("property-photo-upload", P, "front.jpg") === "string", "wrong folder");
  assert.ok(typeof propertyUploadLimits("property-photo-upload", P, `properties/${P}/front.jpg`) === "string", "that is a document's folder");
});

test("storedPropertyDocumentPath: where Blob puts a property document, never the photo folder", () => {
  assert.equal(storedPropertyDocumentPath(`properties/${P}/Lease-2026-AbC123.pdf`, P), true);
  assert.equal(storedPropertyDocumentPath(`properties/${P}/photo/front-xyz.jpg`, P), false);
  assert.equal(storedPropertyDocumentPath(`properties/other/Lease.pdf`, P), false);
  assert.equal(storedPropertyDocumentPath(`properties/${P}/a b.pdf`, P), false);
  assert.equal(storedPropertyDocumentPath(`tasks/${P}/orig/a.pdf`, P), false);
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
