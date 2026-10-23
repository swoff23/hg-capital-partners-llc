import test from "node:test";
import assert from "node:assert/strict";
import { LATE_UPLOAD_WINDOW_MS, acceptsContractorUpload, contractorMaySee } from "./access";

const ME = "contact-me";
const NOW = new Date("2026-10-30T15:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

test("contractors see Shared, live, stored files only", () => {
  const file = { kind: "IMAGE", visibility: "SHARED", deletedAt: null, uploadedByContactId: null, asanaGid: null } as const;
  assert.equal(contractorMaySee(file, ME), true);
  assert.equal(contractorMaySee({ ...file, visibility: "INTERNAL" }, ME), false);
  assert.equal(contractorMaySee({ ...file, deletedAt: ago(1) }, ME), false);
  assert.equal(contractorMaySee({ ...file, kind: "LINK" }, ME), false);
});

test("another contractor's upload stays hidden unless it came from Asana", () => {
  const file = { kind: "IMAGE", visibility: "SHARED", deletedAt: null, asanaGid: null } as const;
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: ME }, ME), true);
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: "someone-else" }, ME), false);
  assert.equal(contractorMaySee({ ...file, uploadedByContactId: "someone-else", asanaGid: "1209" }, ME), true);
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
