import test from "node:test";
import assert from "node:assert/strict";
import { MULTIPART_THRESHOLD, usesMultipart } from "./content-types";
import { PART_BYTES, missingParts, planParts } from "./transfer";

const MB = 1024 * 1024;

test("a part is 8 MB, the size above which a file goes in parts", () => {
  assert.equal(PART_BYTES, 8 * MB);
  assert.equal(PART_BYTES, MULTIPART_THRESHOLD);
  assert.equal(usesMultipart(8 * MB), false);
  assert.equal(usesMultipart(8 * MB + 1), true);
});

test("planParts: 1-based parts of 8 MB, the last the rest, covering the file exactly", () => {
  assert.deepEqual(planParts(0), []);
  assert.deepEqual(planParts(100), [{ partNumber: 1, start: 0, end: 100 }]);
  assert.deepEqual(planParts(8 * MB), [{ partNumber: 1, start: 0, end: 8 * MB }]);
  assert.deepEqual(planParts(8 * MB + 1), [
    { partNumber: 1, start: 0, end: 8 * MB },
    { partNumber: 2, start: 8 * MB, end: 8 * MB + 1 },
  ]);
  // A 300 MB video is 38 parts: 37 of 8 MB and one of 4 MB.
  const video = planParts(300 * MB);
  assert.equal(video.length, 38);
  assert.equal(video[37].end - video[37].start, 4 * MB);
  assert.equal(video[0].partNumber, 1);
  assert.equal(video.at(-1)!.end, 300 * MB);
  for (let i = 1; i < video.length; i++) assert.equal(video[i].start, video[i - 1].end, "no gap and no overlap");
});

test("missingParts: a resume sends only the parts Blob doesn't hold yet", () => {
  const size = 300 * MB;
  assert.equal(missingParts(size, []).length, 38);
  const held = Array.from({ length: 20 }, (_, i) => ({ partNumber: i + 1 }));
  const rest = missingParts(size, held);
  assert.equal(rest.length, 18);
  assert.equal(rest[0].partNumber, 21);
  // Out of order and with a gap: a part that finished while an earlier one was still going.
  assert.deepEqual(
    missingParts(25 * MB, [{ partNumber: 1 }, { partNumber: 3 }]).map((p) => p.partNumber),
    [2, 4],
  );
  assert.deepEqual(missingParts(25 * MB, [{ partNumber: 1 }, { partNumber: 2 }, { partNumber: 3 }, { partNumber: 4 }]), []);
});
