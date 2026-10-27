import test from "node:test";
import assert from "node:assert/strict";
import { BlobServiceNotAvailable } from "@vercel/blob";
import { MAX_FILENAME, contentTypeForName, fileKindForType, fitFilename } from "./content-types";
import {
  BROWSER_STOPPED,
  MEDIA_ACCEPT,
  byline,
  bylineName,
  bylineStamp,
  checkMediaFile,
  datedName,
  documentLook,
  downloadUrl,
  fmtDuration,
  isGenericCameraName,
  pickerAccept,
  propertyFileUrl,
  rowReason,
  storedNames,
  taskFileUrl,
  uploadCountPhrase,
  uploadFailureReason,
  uploadNotice,
  uploadSlug,
  visibleTiles,
  withExtension,
} from "./media";

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

test("uploadNotice: one line however many failed, count first", () => {
  assert.equal(uploadNotice([]), "");
  const offline = { kind: "image" as const, reason: "no connection" };
  assert.equal(
    uploadNotice([
      { name: "PXL_20261023_101500123.jpg", ...offline },
      { name: "PXL_20261023_101500456.jpg", ...offline },
    ]),
    "2 photos didn't upload: no connection",
  );
  assert.equal(uploadNotice([{ name: "VID_0001.mp4", kind: "video", reason: "no connection" }]), "1 video didn't upload: no connection");
  assert.equal(
    uploadNotice([
      { name: "a.jpg", kind: "image", reason: "no connection" },
      { name: "b.mov", kind: "video", reason: "no connection" },
    ]),
    "2 files didn't upload: no connection",
  );
  // Refused by the check (no kind): the extension names it, and the check's reason follows.
  assert.equal(uploadNotice([{ name: "big.jpg", kind: null, reason: "over the 25 MB photo limit" }]), "1 photo didn't upload: over the 25 MB photo limit");
  assert.equal(
    uploadNotice([{ name: "bid.pdf", kind: null, reason: "only photos and videos can be added here" }]),
    "1 file didn't upload: only photos and videos can be added here",
  );
  // Different reasons can't share the line: the count alone.
  assert.equal(
    uploadNotice([
      { name: "a.jpg", kind: "image", reason: "no connection" },
      { name: "b.jpg", kind: null, reason: "over the 25 MB photo limit" },
    ]),
    "2 photos didn't upload",
  );
  assert.equal(
    uploadNotice([{ name: "a.jpg", kind: "image", reason: "Failed to retrieve the client token" }]),
    "1 photo didn't upload: the upload was refused. Reload and try again",
  );
  assert.equal(uploadNotice([{ name: "a.jpg", kind: "image", reason: "" }]), "1 photo didn't upload");
  assert.equal(uploadNotice([{ name: "a.jpg", kind: "image", reason: "File uploads need a Blob store" }]), "File uploads aren't set up yet.");
  // The count alone, for a line with its own Retry; a missing Blob store still says so.
  assert.equal(
    uploadNotice(
      [
        { name: "a.jpg", kind: "image", reason: "no connection" },
        { name: "b.jpg", kind: "image", reason: "no connection" },
      ],
      { reason: false },
    ),
    "2 photos didn't upload",
  );
  assert.equal(
    uploadNotice([{ name: "a.jpg", kind: "image", reason: "File uploads need a Blob store" }], { reason: false }),
    "File uploads aren't set up yet.",
  );
});

test("uploadFailureReason: a dropped connection reads no connection, single PUT or multipart", () => {
  // A single PUT rethrows the browser's own TypeError.
  assert.equal(uploadFailureReason(new TypeError("Failed to fetch")), "no connection");
  assert.equal(uploadFailureReason(new TypeError("Load failed")), "no connection");
  // Multipart turns a part's failed fetch into Blob's own error.
  assert.equal(uploadFailureReason(new BlobServiceNotAvailable()), "no connection");
  assert.equal(uploadFailureReason(new Error("Vercel Blob: The blob service is currently not available. Please try again.")), "no connection");
  // Anything else keeps its words; a non-error has none.
  assert.equal(uploadFailureReason(new Error("Vercel Blob: Failed to retrieve the client token")), "Vercel Blob: Failed to retrieve the client token");
  assert.equal(uploadFailureReason("x"), "");
});

test("uploadFailureReason: the browser's own fetch errors never reach the tile in its words", () => {
  const raw = new TypeError("Failed to execute 'fetch' on 'Window': The provided ReadableStream is disturbed");
  assert.equal(uploadFailureReason(raw), BROWSER_STOPPED);
  assert.equal(uploadFailureReason(raw), "the browser couldn't send it");
  assert.equal(
    uploadNotice([{ name: "Kitchen.jpg", kind: "image", reason: uploadFailureReason(raw) }]),
    "1 photo didn't upload: the browser couldn't send it",
  );
  assert.equal(rowReason(uploadFailureReason(raw)), "The browser couldn't send it");
});

test("fitFilename: a name over 255 characters is cut to fit with its extension, a name that fits is kept", () => {
  assert.equal(MAX_FILENAME, 255);
  assert.equal(fitFilename("Kitchen.jpg"), "Kitchen.jpg");
  const long = `${"K".repeat(296)}.jpg`;
  const fit = fitFilename(long);
  assert.equal(fit.length, 255);
  assert.ok(fit.endsWith("K.jpg"));
  assert.equal(fitFilename("x".repeat(300)).length, 255, "no extension: just cut");
  // Never half of an emoji.
  const emoji = fitFilename(`${"a".repeat(250)}${"😀".repeat(10)}.jpg`);
  assert.ok(emoji.length <= 255);
  assert.ok(!/[\uD800-\uDBFF]\./.test(emoji), "no lone surrogate before the extension");
});

test("storedNames: a real name too long for the record step is cut to fit, its extension kept", () => {
  const [name] = storedNames([{ name: `${"K".repeat(300)}.jpg`, type: "image/jpeg", lastModified: AT }]);
  assert.equal(name.length, 255);
  assert.ok(name.endsWith(".jpg"));
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

/* ---------------- Stored names ---------------- */

// Oct 25, 2026 is daylight time: Eastern is UTC-4, so 18:14 UTC is 2:14 PM.
const AT = Date.UTC(2026, 9, 25, 18, 14, 10);

test("isGenericCameraName: a capture's empty name is generic, a real name never is", () => {
  for (const name of ["image.jpg", "Image.JPG", "video.mov", "photo.png", "photo (3).jpg", "photo(2).jpg", "picture.heic", "movie.mp4"]) {
    assert.equal(isGenericCameraName(name), true, name);
  }
  for (const name of ["Lease 2026.pdf", "IMG_6117.png", "image-final.jpg", "photo of the roof.jpg", "video call notes.txt", "Photo 2026-10-25 at 2.14 PM.jpg", "image"]) {
    assert.equal(isGenericCameraName(name), false, name);
  }
});

test("datedName: date first, the year in it, a period in the time, Eastern clock", () => {
  assert.equal(datedName("image", new Date(AT), "jpg"), "Photo 2026-10-25 at 2.14 PM.jpg");
  assert.equal(datedName("video", new Date(AT), "MOV"), "Video 2026-10-25 at 2.14 PM.mov");
  assert.equal(datedName("image", new Date(AT), "jpg", 2), "Photo 2026-10-25 at 2.14 PM 2.jpg");
  assert.ok(!datedName("image", new Date(AT), "jpg").includes(":"), "Windows refuses a colon in a saved name");
  // 03:05 UTC on the 26th is 11:05 PM on the 25th in Buffalo; midnight is 12.xx AM.
  assert.equal(datedName("image", new Date(Date.UTC(2026, 9, 26, 3, 5)), "jpg"), "Photo 2026-10-25 at 11.05 PM.jpg");
  assert.equal(datedName("image", new Date(Date.UTC(2026, 9, 26, 4, 7)), "jpg"), "Photo 2026-10-26 at 12.07 AM.jpg");
  // After daylight time ends on Nov 1: UTC-5.
  assert.equal(datedName("image", new Date(Date.UTC(2026, 10, 2, 2, 30)), "jpg"), "Photo 2026-11-01 at 9.30 PM.jpg");
});

test("storedNames: generic names are dated, real names stay, a second in the same minute is numbered in pick order", () => {
  const names = storedNames(
    [
      { name: "image.jpg", type: "image/jpeg", lastModified: AT },
      { name: "image.jpg", type: "image/jpeg", lastModified: AT + 20_000 },
      { name: "image.jpg", type: "image/jpeg", lastModified: AT + 60_000 },
      { name: "IMG_6117.png", type: "image/png", lastModified: AT },
      { name: "Lease 2026.pdf", type: "application/pdf", lastModified: AT },
      { name: "video.mov", type: "video/quicktime", lastModified: AT },
      { name: "IMG_6117.png", type: "image/png", lastModified: AT },
    ],
    new Date(Date.UTC(2027, 0, 1)),
  );
  assert.deepEqual(names, [
    "Photo 2026-10-25 at 2.14 PM.jpg",
    "Photo 2026-10-25 at 2.14 PM 2.jpg",
    "Photo 2026-10-25 at 2.15 PM.jpg",
    "IMG_6117.png",
    "Lease 2026.pdf",
    "Video 2026-10-25 at 2.14 PM.mov",
    "IMG_6117.png",
  ]);
});

test("storedNames: no capture time falls back to now, and a nameless file gets an extension from its type", () => {
  const now = new Date(AT);
  assert.deepEqual(storedNames([{ name: "image.jpg", type: "image/jpeg" }], now), ["Photo 2026-10-25 at 2.14 PM.jpg"]);
  assert.deepEqual(storedNames([{ name: "", type: "image/jpeg", lastModified: 0 }], now), ["Photo 2026-10-25 at 2.14 PM.jpg"]);
  assert.deepEqual(storedNames([{ name: "", type: "video/mp4" }], now), ["Video 2026-10-25 at 2.14 PM.mov"]);
});

test("withExtension: swaps the extension, or adds one", () => {
  assert.equal(withExtension("Photo 2026-10-25 at 2.14 PM.heic", "jpg"), "Photo 2026-10-25 at 2.14 PM.jpg");
  assert.equal(withExtension("Kitchen", "jpg"), "Kitchen.jpg");
  assert.equal(withExtension("Bid v1.2", "jpg"), "Bid v1.2.jpg");
});

test("uploadSlug: a dated name is a lowercase slug, anything else is the usual safe name", () => {
  assert.equal(uploadSlug("Photo 2026-10-25 at 2.14 PM.jpg"), "photo-2026-10-25-214pm.jpg");
  assert.equal(uploadSlug("Photo 2026-10-25 at 2.14 PM 2.jpg"), "photo-2026-10-25-214pm-2.jpg");
  assert.equal(uploadSlug("Video 2026-10-25 at 11.05 PM.MOV"), "video-2026-10-25-1105pm.mov");
  assert.equal(uploadSlug("Kitchen (after) é.HEIC"), "Kitchen-after-e.heic");
  assert.equal(uploadSlug("Lease 2026.pdf"), "Lease-2026.pdf");
});

test("uploadCountPhrase: photos and videos by name, a mix with documents is files", () => {
  assert.equal(uploadCountPhrase(["image"]), "1 photo");
  assert.equal(uploadCountPhrase(["image", "image", "image"]), "3 photos");
  assert.equal(uploadCountPhrase(["video"]), "1 video");
  assert.equal(uploadCountPhrase(["image", "image", "image", "video"]), "3 photos and 1 video");
  assert.equal(uploadCountPhrase(["image", "file"]), "2 files");
  assert.equal(uploadCountPhrase(["file"]), "1 file");
  assert.equal(uploadCountPhrase([null, "image"]), "2 files");
});

test("documentLook: a type label and a glyph for a document tile or row", () => {
  assert.deepEqual(documentLook("Lease 2026.pdf"), { label: "PDF", glyph: "text" });
  assert.deepEqual(documentLook("Rent roll Sep.xlsx"), { label: "XLSX", glyph: "sheet" });
  assert.deepEqual(documentLook("export.csv"), { label: "CSV", glyph: "sheet" });
  assert.deepEqual(documentLook("Insurance card.jpeg"), { label: "JPG", glyph: "image" });
  assert.deepEqual(documentLook("IMG_0003.HEIC"), { label: "HEIC", glyph: "image" });
  assert.deepEqual(documentLook("notes"), { label: "FILE", glyph: "text" });
});

test("bylineStamp: the brand's date in Buffalo time, the year only when it isn't this year", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  assert.equal(bylineStamp("2026-10-03T18:14:00Z", { now }), "Oct 3");
  assert.equal(bylineStamp("2026-10-03T18:14:00Z", { now, time: true }), "Oct 3, 2:14 PM");
  assert.equal(bylineStamp(new Date("2025-10-03T18:14:00Z"), { now }), "Oct 3, 2025");
  // 02:30 UTC on the 4th is 10:30 PM on the 3rd in Buffalo.
  assert.equal(bylineStamp("2026-10-04T02:30:00Z", { now, time: true }), "Oct 3, 10:30 PM");
  assert.equal(bylineStamp(null), "");
  assert.equal(bylineStamp("not a date"), "");
});

test("rowReason: a file row's words for why a file didn't go up", () => {
  assert.equal(rowReason("no connection"), "No connection");
  assert.equal(rowReason("over the 50 MB file limit"), "Over the 50 MB limit");
  assert.equal(rowReason("over the 25 MB photo limit"), "Over the 25 MB limit");
  assert.equal(rowReason("only photos and documents can be added here"), "This type can't be added");
  assert.equal(rowReason("the file is empty"), "The file is empty");
  // A row has its own Retry, so it never says to reload.
  assert.equal(rowReason("Failed to retrieve the client token"), "Upload refused");
  assert.equal(rowReason(""), "Didn't upload");
  assert.equal(rowReason(undefined), "Didn't upload");
});

test("byline: who and when, either alone when the other is missing", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  assert.equal(bylineName("Connor Swofford"), "Connor");
  assert.equal(bylineName("  Zack  "), "Zack");
  assert.equal(bylineName("pieter@hg.test"), "pieter@hg.test");
  assert.equal(bylineName(null), "");
  assert.equal(byline("Connor Swofford", "2026-10-03T18:14:00Z", { now }), "Connor · Oct 3");
  assert.equal(byline(null, "2026-10-03T18:14:00Z", { now }), "Oct 3");
  assert.equal(byline("Connor", null), "Connor");
  assert.equal(byline(null, null), "");
});

test("file urls: the gated routes, and a saving link", () => {
  assert.equal(propertyFileUrl("p1"), "/api/files/property/p1");
  assert.equal(downloadUrl("/api/files/task/abc"), "/api/files/task/abc?download=1");
  assert.equal(downloadUrl("/api/files/task/abc?v=thumb"), "/api/files/task/abc?v=thumb&download=1");
});

test("visibleTiles: two even rows, counted as they fall", () => {
  // No labels: 6 on a phone, 12 from sm.
  assert.equal(visibleTiles(40, 3, 2), 6);
  assert.equal(visibleTiles(40, 6, 2), 12);
  assert.equal(visibleTiles(4, 3, 2), 4, "fewer than the cap: all of them");
  assert.equal(visibleTiles(0, 3, 2), 0);
  // One row (the Review card).
  assert.equal(visibleTiles(40, 3, 1), 3);
  assert.equal(visibleTiles(40, 6, 1), 6);
});

test("visibleTiles: a labeled run starts a new row, so '+N' ends the second row, not the third", () => {
  // 14 photos, "At finish" is the first 2, "Other photos" start at 2.
  assert.equal(visibleTiles(14, 3, 2, [0, 2]), 5, "phone: 2, then 3, with +9 on the 5th");
  assert.equal(visibleTiles(14, 6, 2, [0, 2]), 8, "wide: 2, then 6, with +7 on the 8th");
  // A full first run fills its row; the second run starts the next one.
  assert.equal(visibleTiles(14, 3, 2, [0, 3]), 6);
  assert.equal(visibleTiles(20, 6, 2, [0, 6]), 12);
  // A first run longer than a row wraps first; the next run starts a new row, which is past two here.
  assert.equal(visibleTiles(20, 3, 2, [0, 4]), 4, "4 at finish take both rows; '+16' ends the second and 'Other photos' wait");
  // Few photos: everything shows, labels or not.
  assert.equal(visibleTiles(3, 6, 2, [0, 1]), 3);
});
