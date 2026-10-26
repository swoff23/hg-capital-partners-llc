import test from "node:test";
import assert from "node:assert/strict";
import {
  LATE_UPLOAD_WINDOW_MS,
  QUEUED_UPLOAD_GRACE_MS,
  ZIP_VIEWERS,
  acceptsContractorUpload,
  contractorMaySee,
  mayDownloadZip,
  parseQueuedAt,
} from "./access";

const ME = "contact-me";
const NOW = new Date("2026-10-30T15:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

test("contractors see Shared, live, stored files only", () => {
  const file = { kind: "IMAGE", visibility: "SHARED", deletedAt: null, uploadedByContactId: null, asanaGid: null, audienceContactId: null } as const;
  assert.equal(contractorMaySee(file, ME), true);
  assert.equal(contractorMaySee({ ...file, visibility: "INTERNAL" }, ME), false);
  assert.equal(contractorMaySee({ ...file, deletedAt: ago(1) }, ME), false);
  assert.equal(contractorMaySee({ ...file, kind: "LINK" }, ME), false);
});

test("another contractor's upload stays hidden unless it came from Asana", () => {
  const file = { kind: "IMAGE", visibility: "SHARED", deletedAt: null, asanaGid: null, audienceContactId: null } as const;
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: ME }, ME), true);
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: "someone-else" }, ME), false);
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: "someone-else", asanaGid: "1209" }, ME), true);
});

test("a staff upload sent to the previous contractor stays theirs", () => {
  const file = { kind: "IMAGE", visibility: "SHARED", deletedAt: null, uploadedByContactId: null, asanaGid: null } as const;
  assert.equal(contractorMaySee({ ...file, audienceContactId: ME }, ME), true);
  assert.equal(contractorMaySee({ ...file, audienceContactId: "previous-contractor" }, ME), false);
  assert.equal(contractorMaySee({ ...file, audienceContactId: null }, ME), true);
});

test("a job still in the contractor's hands takes uploads", () => {
  for (const status of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"] as const) {
    assert.equal(acceptsContractorUpload({ status, completedByContactId: null, completedAt: null }, null, ME, NOW), true, status);
  }
});

test("Review and Done: only the contractor who marked it done, within the hour", () => {
  for (const status of ["REVIEW", "DONE"] as const) {
    const task = { status, completedByContactId: null, completedAt: null };
    assert.equal(acceptsContractorUpload(task, { actorContactId: ME, createdAt: ago(10) }, ME, NOW), true, status);
    assert.equal(acceptsContractorUpload(task, { actorContactId: ME, createdAt: ago(60) }, ME, NOW), true, status);
    assert.equal(acceptsContractorUpload(task, { actorContactId: ME, createdAt: ago(61) }, ME, NOW), false, status);
    assert.equal(acceptsContractorUpload(task, { actorContactId: "someone-else", createdAt: ago(10) }, ME, NOW), false, status);
    // Staff moved it to Review: no event by this contractor.
    assert.equal(acceptsContractorUpload(task, { actorContactId: null, createdAt: ago(1) }, ME, NOW), false, status);
    assert.equal(acceptsContractorUpload(task, null, ME, NOW), false, status);
  }
  assert.equal(LATE_UPLOAD_WINDOW_MS, 60 * 60 * 1000);
});

test("Done by the contractor themselves counts too", () => {
  assert.equal(acceptsContractorUpload({ status: "DONE", completedByContactId: ME, completedAt: ago(30) }, null, ME, NOW), true);
  assert.equal(acceptsContractorUpload({ status: "DONE", completedByContactId: ME, completedAt: ago(90) }, null, ME, NOW), false);
  assert.equal(acceptsContractorUpload({ status: "DONE", completedByContactId: "someone-else", completedAt: ago(1) }, null, ME, NOW), false);
});

/* ---------------- The late-upload rule (uploads question 4) ---------------- */

const HOUR = 60;
const queued = (minAgo: number) => ago(minAgo).toISOString();
const reviewTask = { status: "REVIEW" as const, completedByContactId: null, completedAt: null };
const markedDone = (minAgo: number) => ({ actorContactId: ME, createdAt: ago(minAgo) });

test("a file queued before Mark done still records after the hour, within a day", () => {
  // Mark done 3 hours ago; the photo was queued 3 hours and 10 minutes ago, in a basement with no signal.
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(3 * HOUR), ME, NOW, queued(3 * HOUR + 10)), true);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(23 * HOUR), ME, NOW, queued(23 * HOUR + 10)), true);
  assert.equal(
    acceptsContractorUpload({ status: "DONE", completedByContactId: ME, completedAt: ago(5 * HOUR) }, null, ME, NOW, queued(6 * HOUR)),
    true,
  );
});

test("a file queued after Mark done gets only the hour", () => {
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(3 * HOUR), ME, NOW, queued(2 * HOUR)), false);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(3 * HOUR), ME, NOW), false);
  // Within the hour it is accepted either way: "Add photo/video" stays on while HG reviews.
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(30), ME, NOW, queued(5)), true);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(30), ME, NOW), true);
});

test("the grace ends a day after Mark done, whenever the file was queued", () => {
  assert.equal(QUEUED_UPLOAD_GRACE_MS, 24 * 60 * 60 * 1000);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(24 * HOUR), ME, NOW, queued(25 * HOUR)), true);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(24 * HOUR + 1), ME, NOW, queued(25 * HOUR)), false);
});

test("queuedAt doesn't help someone else's upload, a Canceled job, or a staff-marked Review", () => {
  assert.equal(acceptsContractorUpload(reviewTask, { actorContactId: "someone-else", createdAt: ago(2 * HOUR) }, ME, NOW, queued(3 * HOUR)), false);
  assert.equal(acceptsContractorUpload(reviewTask, { actorContactId: null, createdAt: ago(2 * HOUR) }, ME, NOW, queued(3 * HOUR)), false);
  assert.equal(acceptsContractorUpload(reviewTask, null, ME, NOW, queued(3 * HOUR)), false);
  const canceled = { status: "CANCELED" as const, completedByContactId: ME, completedAt: ago(1) };
  assert.equal(acceptsContractorUpload(canceled, markedDone(2 * HOUR), ME, NOW, queued(3 * HOUR)), false);
});

test("a queuedAt that isn't a date, or is in the future, is ignored", () => {
  for (const bad of ["", "yesterday", "2026-13-45", null, undefined]) {
    assert.equal(parseQueuedAt(bad, NOW), null, String(bad));
    assert.equal(acceptsContractorUpload(reviewTask, markedDone(3 * HOUR), ME, NOW, bad), false, String(bad));
  }
  // A phone a few minutes fast is fine; a day ahead is not.
  assert.ok(parseQueuedAt(new Date(NOW.getTime() + 60_000), NOW));
  assert.equal(parseQueuedAt(new Date(NOW.getTime() + 24 * 60 * 60_000), NOW), null);
  assert.equal(acceptsContractorUpload(reviewTask, markedDone(3 * HOUR), ME, NOW, new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString()), false);
});

test("an active job takes uploads whatever queuedAt says", () => {
  assert.equal(acceptsContractorUpload({ status: "IN_PROGRESS", completedByContactId: null, completedAt: null }, null, ME, NOW, "nonsense"), true);
});

test("Download all (ZIP) is staff only, and only for a task", () => {
  assert.deepEqual(ZIP_VIEWERS.task, ["staff"]);
  assert.equal(mayDownloadZip("task", "staff"), true);
  assert.equal(mayDownloadZip("task", "contractor"), false);
  assert.equal(mayDownloadZip("property", "staff"), false);
  assert.equal(mayDownloadZip("__proto__", "staff"), false);
  assert.equal(mayDownloadZip("constructor", "staff"), false);
});

test("Canceled jobs never take uploads", () => {
  const canceled = { status: "CANCELED" as const, completedByContactId: ME, completedAt: ago(1) };
  assert.equal(acceptsContractorUpload(canceled, { actorContactId: ME, createdAt: ago(1) }, ME, NOW), false);
});
