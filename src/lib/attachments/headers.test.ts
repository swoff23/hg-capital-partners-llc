import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_HEADERS, FILE_CACHE_CONTROL, fileResponseHeaders, opensInline, previewName, signedRedirectHeaders, singleByteRange } from "./headers";

test("every file response is nosniff and cached by the browser only", () => {
  for (const contentType of ["image/jpeg", "video/mp4", "application/pdf", "text/plain", null]) {
    const h = fileResponseHeaders({ contentType, filename: "x" });
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["Cache-Control"], "private, max-age=31536000, immutable");
    assert.equal(/public|s-maxage/.test(h["Cache-Control"]), false);
  }
  assert.equal(FILE_CACHE_CONTROL.startsWith("private"), true);
});

test("CSP: sandboxed everywhere except PDFs, which get default-src 'none' alone", () => {
  assert.equal(fileResponseHeaders({ contentType: "image/png", filename: "a.png" })["Content-Security-Policy"], "sandbox; default-src 'none'");
  assert.equal(fileResponseHeaders({ contentType: "text/html", filename: "a.html" })["Content-Security-Policy"], "sandbox; default-src 'none'");
  assert.equal(fileResponseHeaders({ contentType: "application/pdf", filename: "a.pdf" })["Content-Security-Policy"], "default-src 'none'");
});

test("only images, videos and PDFs open inline; the rest download", () => {
  assert.equal(opensInline("image/jpeg"), true);
  assert.equal(opensInline("video/quicktime"), true);
  assert.equal(opensInline("application/pdf"), true);
  assert.equal(opensInline("image/svg+xml"), false);
  assert.equal(opensInline("text/html"), false);
  assert.equal(opensInline("text/plain"), false);
  assert.equal(opensInline(null), false);
  assert.equal(fileResponseHeaders({ contentType: "image/jpeg", filename: "a.jpg" })["Content-Disposition"].startsWith("inline; "), true);
  assert.equal(fileResponseHeaders({ contentType: "text/csv", filename: "a.csv" })["Content-Disposition"].startsWith("attachment; "), true);
  assert.equal(fileResponseHeaders({ contentType: "image/svg+xml", filename: "a.svg" })["Content-Disposition"].startsWith("attachment; "), true);
});

test("Content-Type is a clean type, octet-stream when unknown; Content-Length only when numeric", () => {
  assert.equal(fileResponseHeaders({ contentType: "Text/Plain; charset=utf-8", filename: "a" })["Content-Type"], "text/plain");
  assert.equal(fileResponseHeaders({ contentType: "", filename: "a" })["Content-Type"], "application/octet-stream");
  assert.equal(fileResponseHeaders({ contentType: "bad\r\nheader", filename: "a" })["Content-Type"], "application/octet-stream");
  assert.equal(fileResponseHeaders({ contentType: "image/png", filename: "a", size: 1234 })["Content-Length"], "1234");
  assert.equal(fileResponseHeaders({ contentType: "image/png", filename: "a", size: "12" })["Content-Length"], "12");
  assert.equal("Content-Length" in fileResponseHeaders({ contentType: "image/png", filename: "a", size: null }), false);
  assert.equal("Content-Length" in fileResponseHeaders({ contentType: "image/png", filename: "a", size: "1, 2" }), false);
});

test("the signed-video redirect and errors are never cached", () => {
  const r = signedRedirectHeaders("https://abc.private.blob.vercel-storage.com/x.mp4?sig=1");
  assert.equal(r.Location, "https://abc.private.blob.vercel-storage.com/x.mp4?sig=1");
  assert.equal(r["Cache-Control"], "private, no-store");
  assert.equal(r["X-Content-Type-Options"], "nosniff");
  assert.equal(ERROR_HEADERS["Cache-Control"], "private, no-store");
});

test("singleByteRange passes one simple range and drops the rest", () => {
  assert.equal(singleByteRange("bytes=0-"), "bytes=0-");
  assert.equal(singleByteRange("bytes=100-199"), "bytes=100-199");
  assert.equal(singleByteRange("bytes=-500"), "bytes=-500");
  assert.equal(singleByteRange("bytes=0-1,5-9"), null);
  assert.equal(singleByteRange("items=0-1"), null);
  assert.equal(singleByteRange(null), null);
});

test("the saved name agrees with the served type, hidden marks stripped", () => {
  const cd = (contentType: string | null, filename: string) => fileResponseHeaders({ contentType, filename })["Content-Disposition"];
  assert.equal(cd("text/plain", "Invoice.html"), `attachment; filename="Invoice.txt"; filename*=UTF-8''Invoice.txt`);
  assert.equal(cd("application/pdf", "setup.exe"), `inline; filename="setup.pdf"; filename*=UTF-8''setup.pdf`);
  assert.equal(cd("image/jpeg", "photo\u202Egpj.exe"), `inline; filename="photogpj.jpg"; filename*=UTF-8''photogpj.jpg`);
  // Older rows outside the allowlist keep their name.
  assert.equal(cd("application/msword", "lease.doc"), `attachment; filename="lease.doc"; filename*=UTF-8''lease.doc`);
});

test("previewName names a thumbnail or poster after the original, with its own extension", () => {
  assert.equal(previewName("Roof leak.mov", "poster", "tasks/x/poster/a.jpg"), "Roof leak-poster.jpg");
  assert.equal(previewName("IMG_0001.HEIC", "thumb", "tasks/x/thumb/IMG_0001-AbC123.jpg"), "IMG_0001-thumb.jpg");
  assert.equal(previewName("README", "thumb", "tasks/x/thumb/a"), "README-thumb");
});
