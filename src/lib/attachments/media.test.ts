import test from "node:test";
import assert from "node:assert/strict";
import { contentTypeForName, fileKindForType } from "./content-types";
import { MEDIA_ACCEPT, checkMediaFile, fmtDuration, pickerAccept, taskFileUrl, uploadNotice } from "./media";

const MB = 1024 * 1024;

test("checkMediaFile: photos and videos pass with their upload type and kind", () => {
  assert.deepEqual(checkMediaFile({ name: "IMG_0001.JPG", type: "image/jpeg", size: 3 * MB }), {
    ok: true,
    contentType: "image/jpeg",
    fileKind: "image",
  });
  assert.deepEqual(checkMediaFile({ name: "IMG_0002.MOV", type: "video/quicktime", size: 70 * MB }), {
    ok: true,
    contentType: "video/quicktime",
    fileKind: "video",
  });
});

test("checkMediaFile: a HEIC with no browser type is typed from its extension", () => {
  const r = checkMediaFile({ name: "IMG_0003.HEIC", type: "", size: 2 * MB });
  assert.deepEqual(r, { ok: true, contentType: "image/heic", fileKind: "image" });
});

test("checkMediaFile: documents, SVG and HTML are refused here", () => {
  assert.deepEqual(checkMediaFile({ name: "bid.pdf", type: "application/pdf", size: MB }), {
    ok: false,
    error: "only photos and videos can be added here",
  });
  assert.equal(checkMediaFile({ name: "x.svg", type: "image/svg+xml", size: 10 }).ok, false);
  assert.equal(checkMediaFile({ name: "x.html", type: "text/html", size: 10 }).ok, false);
});

test("checkMediaFile: the allowed kinds can be widened or narrowed", () => {
  assert.equal(checkMediaFile({ name: "bid.pdf", type: "application/pdf", size: MB }, ["image", "video", "file"]).ok, true);
  assert.deepEqual(checkMediaFile({ name: "a.mp4", type: "video/mp4", size: MB }, ["image"]), {
    ok: false,
    error: "only photos can be added here",
  });
  assert.deepEqual(checkMediaFile({ name: "a.exe", type: "", size: MB }, ["image", "video", "file"]), {
    ok: false,
    error: "only photos, videos and documents can be added here",
  });
});

test("checkMediaFile: size caps per kind, and empty files", () => {
  assert.deepEqual(checkMediaFile({ name: "big.jpg", type: "image/jpeg", size: 25 * MB + 1 }), {
    ok: false,
    error: "over the 25 MB photo limit",
  });
  assert.equal(checkMediaFile({ name: "ok.jpg", type: "image/jpeg", size: 25 * MB }).ok, true);
  assert.deepEqual(checkMediaFile({ name: "long.mov", type: "video/quicktime", size: 501 * MB }), {
    ok: false,
    error: "over the 500 MB video limit",
  });
  assert.deepEqual(checkMediaFile({ name: "zero.jpg", type: "image/jpeg", size: 0 }), { ok: false, error: "the file is empty" });
});

test("uploadNotice: one line however many failed", () => {
  assert.equal(uploadNotice([]), "");
  assert.equal(uploadNotice([{ name: "a.jpg", reason: "over the 25 MB photo limit" }]), "Couldn't add a.jpg: over the 25 MB photo limit");
  assert.equal(
    uploadNotice([
      { name: "a.jpg", reason: "same" },
      { name: "b.jpg", reason: "same" },
    ]),
    "Couldn't add a.jpg and 1 more: same",
  );
  assert.equal(
    uploadNotice([
      { name: "a.jpg", reason: "one" },
      { name: "b.jpg", reason: "two" },
    ]),
    "Couldn't add 2 files. a.jpg: one",
  );
  assert.equal(
    uploadNotice([{ name: "a.jpg", reason: "Failed to retrieve the client token" }]),
    "Couldn't add a.jpg: the upload was refused. Reload and try again",
  );
  assert.equal(uploadNotice([{ name: "a.jpg", reason: "File uploads need a Blob store" }]), "File uploads aren't set up yet.");
});

test("fmtDuration: m:ss under an hour, h:mm:ss over", () => {
  assert.equal(fmtDuration(7), "0:07");
  assert.equal(fmtDuration(59.6), "1:00");
  assert.equal(fmtDuration(272), "4:32");
  assert.equal(fmtDuration(3723), "1:02:03");
  assert.equal(fmtDuration(0), "0:00");
  assert.equal(fmtDuration(null), "");
  assert.equal(fmtDuration(-1), "");
  assert.equal(fmtDuration(Number.NaN), "");
});

test("taskFileUrl: the gated route, with a variant when asked", () => {
  assert.equal(taskFileUrl("abc123"), "/api/files/task/abc123");
  assert.equal(taskFileUrl("abc123", "thumb"), "/api/files/task/abc123?v=thumb");
  assert.equal(taskFileUrl("abc123", "poster"), "/api/files/task/abc123?v=poster");
  assert.equal(taskFileUrl("a/b"), "/api/files/task/a%2Fb");
});

test("pickerAccept: photos and videos by default, documents only when allowed", () => {
  assert.equal(MEDIA_ACCEPT, "image/*,video/*,.heic,.heif,.mov,.mp4");
  assert.equal(pickerAccept(), MEDIA_ACCEPT);
  assert.equal(pickerAccept(["image"]), "image/*,.heic,.heif");
  const withDocs = pickerAccept(["image", "video", "file"]).split(",");
  for (const want of ["image/*", "video/*", ".heic", ".mov", "application/pdf", ".pdf", ".docx", ".xlsx", ".csv", ".txt"]) {
    assert.ok(withDocs.includes(want), `missing ${want}`);
  }
  assert.ok(!pickerAccept(["image", "video"]).includes("pdf"), "no documents unless asked");
});

test("pickerAccept: every document extension it offers is one the upload check accepts", () => {
  const exts = pickerAccept(["file"])
    .split(",")
    .filter((p) => p.startsWith("."));
  assert.ok(exts.length > 0);
  for (const ext of exts) assert.equal(fileKindForType(contentTypeForName(`a${ext}`)), "file", ext);
});
