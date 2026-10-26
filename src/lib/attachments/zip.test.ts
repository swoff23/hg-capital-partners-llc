import test from "node:test";
import assert from "node:assert/strict";
import { zipEntryNames, zipFileName } from "./zip";

test("zipFileName: the address, then the title, as the spec's example", () => {
  assert.equal(zipFileName({ address: "56 Tamarack St", title: "Fix porch light" }), "56 Tamarack St Fix porch light.zip");
  assert.equal(zipFileName({ title: "Fix porch light" }), "Fix porch light.zip");
  assert.equal(zipFileName({ address: "56 Tamarack St", title: null }), "56 Tamarack St.zip");
  assert.equal(zipFileName({}), "Task files.zip");
});

test("zipFileName: nothing a file system refuses, one space between words, nothing hidden", () => {
  assert.equal(zipFileName({ address: "56 Tamarack St", title: 'Fix "porch" light: 2/3 <urgent>' }), "56 Tamarack St Fix porch light 2 3 urgent.zip");
  assert.equal(zipFileName({ title: "  ..hidden   name  " }), "hidden name.zip");
  assert.equal(zipFileName({ title: "///" }), "Task files.zip");
  assert.ok(zipFileName({ address: "a".repeat(300), title: "b" }).length <= 124);
});

test("zipEntryNames: each file keeps its name, a repeat is numbered like a second photo of one minute, case doesn't matter", () => {
  assert.deepEqual(zipEntryNames(["Lease.pdf", "Photo 2026-10-25 at 2.14 PM.jpg", "lease.PDF", "Lease.pdf", "notes"]), [
    "Lease.pdf",
    "Photo 2026-10-25 at 2.14 PM.jpg",
    "lease 2.PDF",
    "Lease 3.pdf",
    "notes",
  ]);
  assert.deepEqual(zipEntryNames(["a", "a", "a"]), ["a", "a 2", "a 3"]);
});

test("zipEntryNames: no folders, no control characters, and an empty name is file", () => {
  assert.deepEqual(zipEntryNames(["../../etc/passwd", "a\\b.txt", "x\u0000y.pdf", "   ", "..."]), ["etc passwd", "a b.txt", "x y.pdf", "file", "file 2"]);
});

test("client-zip streams the route's entries (a name, a date, a ReadableStream) into one archive with every name in it", async () => {
  const { downloadZip } = await import("client-zip");
  const names = zipEntryNames(["Photo 2026-10-25 at 2.14 PM.jpg", "Lease.pdf", "lease.pdf"]);
  async function* entries() {
    for (const [i, name] of names.entries()) {
      const bytes = new TextEncoder().encode(`file ${i}`);
      yield { name, lastModified: new Date(Date.UTC(2026, 9, 25, 18, 14)), input: new Blob([bytes]).stream() };
    }
  }
  const bytes = new Uint8Array(await downloadZip(entries()).arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "PK\u0003\u0004", "a ZIP local header leads");
  for (const name of names) assert.ok(text.includes(name), name);
  assert.deepEqual(names, ["Photo 2026-10-25 at 2.14 PM.jpg", "Lease.pdf", "lease 2.pdf"]);
  assert.ok(text.includes("file 0") && text.includes("file 2"), "the bytes are stored");
});
