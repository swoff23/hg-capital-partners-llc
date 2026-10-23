import test from "node:test";
import assert from "node:assert/strict";
import { LATE_UPLOAD_WINDOW_MS, acceptsContractorUpload, contractorMaySee } from "./access";

const ME = "contact-me";
const NOW = new Date("2026-10-30T15:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

test("contractors see Shared, live, stored files only", () => {
  assert.equal(contractorMaySee({ kind: "IMAGE", visibility: "SHARED", deletedAt: null }), true);
  assert.equal(contractorMaySee({ kind: "IMAGE", visibility: "INTERNAL", deletedAt: null }), false);
  assert.equal(contractorMaySee({ kind: "IMAGE", visibility: "SHARED", deletedAt: ago(1) }), false);
  assert.equal(contractorMaySee({ kind: "LINK", visibility: "SHARED", deletedAt: null }), false);
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

test("Canceled jobs never take uploads", () => {
  const canceled = { status: "CANCELED" as const, completedByContactId: ME, completedAt: ago(1) };
  assert.equal(acceptsContractorUpload(canceled, { actorContactId: ME, createdAt: ago(1) }, ME, NOW), false);
});
