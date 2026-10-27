import test from "node:test";
import assert from "node:assert/strict";
import { RecordedUploads, recordedUploads, type RecordedUpload } from "./recorded-uploads";

// The job page's record step answers with an id alone, so each page notes what
// it recorded. A batch can start under one visit to the job and land under the
// next (chunk 6 review, fix 6): the second visit must still know the first
// visit's files, or they're dropped and never posted.

const photo = (id: string): RecordedUpload => ({ id, name: `${id}.jpg`, kind: "image", hasThumb: true, hasPoster: false });

test("a batch that started on an earlier visit to the job lands with every file it holds", () => {
  const tab = new RecordedUploads();
  // Visit 1 records photos 1 to 3, then the contractor leaves for My jobs.
  for (const id of ["a1", "a2", "a3"]) tab.note("t1", photo(id));
  // Visit 2 (a new page) records 4 and 5; the queue reports the whole batch to it.
  for (const id of ["a4", "a5"]) tab.note("t1", photo(id));
  const landed = tab.take("t1", ["a1", "a2", "a3", "a4", "a5"]);
  assert.deepEqual(
    landed.map((r) => [r.id, r.kind]),
    [
      ["a1", "image"],
      ["a2", "image"],
      ["a3", "image"],
      ["a4", "image"],
      ["a5", "image"],
    ],
  );
});

test("a file no page here noted (a reload in between) still comes back, by id alone", () => {
  const tab = new RecordedUploads();
  tab.note("t1", photo("a1"));
  assert.deepEqual(tab.take("t1", ["a1", "a9"]), [photo("a1"), { id: "a9", name: "", kind: null, hasThumb: false, hasPoster: false }]);
});

test("each file is handed over once, and jobs never mix", () => {
  const tab = new RecordedUploads();
  tab.note("t1", photo("a1"));
  tab.note("t2", photo("b1"));
  assert.equal(tab.take("t2", ["a1"])[0].kind, null, "t1's file is not t2's");
  assert.equal(tab.take("t1", ["a1"])[0].kind, "image");
  assert.equal(tab.take("t1", ["a1"])[0].kind, null, "already handed over");
  assert.equal(tab.take("t2", ["b1"])[0].name, "b1.jpg");
});

test("every job page shares one registry for the tab", () => {
  assert.ok(recordedUploads instanceof RecordedUploads);
});
