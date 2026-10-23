import test from "node:test";
import assert from "node:assert/strict";
import {
  FILE_KINDS,
  PREVIEW_RULE,
  UPLOAD_RULES,
  contentTypeForName,
  fileKindForType,
  filenameForType,
  nameExtension,
  normalizeContentType,
  uploadContentType,
} from "./content-types";

const MB = 1024 * 1024;

test("normalizeContentType: lowercases, drops parameters, refuses junk", () => {
  assert.equal(normalizeContentType("Image/JPEG"), "image/jpeg");
  assert.equal(normalizeContentType("text/plain; charset=utf-8"), "text/plain");
  assert.equal(normalizeContentType(""), "");
  assert.equal(normalizeContentType(null), "");
  assert.equal(normalizeContentType("not a type"), "");
  assert.equal(normalizeContentType("text/html\r\nX-Evil: 1"), "");
});

test("each kind has its own allowlist and cap", () => {
  assert.equal(fileKindForType("image/jpeg"), "image");
  assert.equal(fileKindForType("image/heic"), "image");
  assert.equal(fileKindForType("image/heif"), "image");
  assert.equal(fileKindForType("video/quicktime"), "video");
  assert.equal(fileKindForType("video/mp4"), "video");
  assert.equal(fileKindForType("application/pdf"), "file");
  assert.equal(fileKindForType("text/csv; charset=utf-8"), "file");
  assert.equal(UPLOAD_RULES.image.maxBytes, 25 * MB);
  assert.equal(UPLOAD_RULES.video.maxBytes, 500 * MB);
  assert.equal(UPLOAD_RULES.file.maxBytes, 50 * MB);
});

test("never SVG, HTML or script, in any kind or as a preview", () => {
  for (const t of ["image/svg+xml", "text/html", "application/xhtml+xml", "application/javascript", "text/javascript", "application/xml"]) {
    assert.equal(fileKindForType(t), null, t);
    assert.equal(PREVIEW_RULE.contentTypes.includes(t), false, t);
  }
  for (const k of FILE_KINDS) {
    assert.equal(UPLOAD_RULES[k].contentTypes.some((t) => /svg|html|script|\/xml$/.test(t)), false, k);
  }
});

test("previews are stills a browser can draw: no HEIC", () => {
  assert.deepEqual([...PREVIEW_RULE.contentTypes], ["image/jpeg", "image/png", "image/webp"]);
});

test("contentTypeForName reads only allowed extensions", () => {
  assert.equal(contentTypeForName("IMG_0001.HEIC"), "image/heic");
  assert.equal(contentTypeForName("walkthrough.MOV"), "video/quicktime");
  assert.equal(contentTypeForName("lease.pdf"), "application/pdf");
  assert.equal(contentTypeForName("page.html"), null);
  assert.equal(contentTypeForName("logo.svg"), null);
  assert.equal(contentTypeForName("no-extension"), null);
});

test("uploadContentType prefers the browser's type, then the extension", () => {
  assert.equal(uploadContentType("a.jpg", "image/png"), "image/png");
  // Chrome on Windows sends no type for HEIC.
  assert.equal(uploadContentType("IMG_1.heic", ""), "image/heic");
  // Windows reports CSV as Excel.
  assert.equal(uploadContentType("rent roll.csv", "application/vnd.ms-excel"), "text/csv");
  // An HTML file renamed .jpg is still uploaded as a JPEG; nosniff and the sandbox CSP cover the bytes.
  assert.equal(uploadContentType("x.jpg", "text/html"), "image/jpeg");
  assert.equal(uploadContentType("x.svg", "image/svg+xml"), null);
  assert.equal(uploadContentType("setup.exe", "application/x-msdownload"), null);
});

test("nameExtension: only a short one with a letter in it", () => {
  assert.equal(nameExtension("lease.PDF"), "PDF");
  assert.equal(nameExtension("Bid v1.2"), null);
  assert.equal(nameExtension("README"), null);
  assert.equal(nameExtension("a.verylongextension"), null);
});

test("filenameForType: the extension always names the verified type", () => {
  assert.equal(filenameForType("Invoice.html", "text/plain"), "Invoice.txt");
  assert.equal(filenameForType("setup.exe", "application/pdf"), "setup.pdf");
  assert.equal(filenameForType("Kitchen", "image/jpeg"), "Kitchen.jpg");
  assert.equal(filenameForType("scan.jpg", "image/png"), "scan.png");
  assert.equal(filenameForType("Bid v1.2", "application/pdf"), "Bid v1.2.pdf");
  assert.equal(filenameForType(".jpg", "image/jpeg"), "file.jpg");
  assert.equal(filenameForType("", "text/csv"), "file.csv");
  assert.equal(filenameForType("Invoice.html.", "text/plain"), "Invoice.txt");
});

test("filenameForType keeps a name that already agrees, in its own case", () => {
  assert.equal(filenameForType("IMG_0001.HEIC", "image/heic"), "IMG_0001.HEIC");
  assert.equal(filenameForType("photo.jpeg", "image/jpeg"), "photo.jpeg");
  assert.equal(filenameForType("Rent roll.csv", "text/csv; charset=utf-8"), "Rent roll.csv");
  assert.equal(filenameForType("Léase 2026.pdf", "application/pdf"), "Léase 2026.pdf");
});

test("filenameForType strips controls, zero-width and bidi marks", () => {
  assert.equal(filenameForType("photo\u202Egpj.exe", "image/jpeg"), "photogpj.jpg");
  assert.equal(filenameForType("in\u200Bvoice\u0000.pdf\u2066", "application/pdf"), "invoice.pdf");
  assert.equal(filenameForType("a\r\nb.txt", "text/plain"), "ab.txt");
});

test("filenameForType leaves older rows' types alone, and caps at 255", () => {
  assert.equal(filenameForType("lease.doc", "application/msword"), "lease.doc");
  assert.equal(filenameForType("notes.bin", null), "notes.bin");
  assert.equal(filenameForType("  ", null), "file");
  const long = filenameForType(`${"x".repeat(300)}.html`, "text/plain");
  assert.equal(long.length, 255);
  assert.equal(long.endsWith("x.txt"), true);
  const kept = filenameForType(`${"y".repeat(300)}.pdf`, "application/pdf");
  assert.equal(kept.length, 255);
  assert.equal(kept.endsWith("y.pdf"), true);
});
