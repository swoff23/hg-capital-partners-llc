import test from "node:test";
import assert from "node:assert/strict";
import { deleteLeavesCrewNote, deletedJob, goneJobFor, goneJobStreet, type GoneJobFacts } from "./gone-job-text";

const base: GoneJobFacts = {
  canceled: false,
  contractorHasJob: true,
  contractorName: "Zack Miller",
  title: "Replace back door",
  address: "118 Congress St, Buffalo, NY 14201",
  unitLabel: "Rear",
};

test("a canceled job says so, with its title and street", () => {
  const gone = goneJobFor({ ...base, canceled: true });
  assert.equal(gone?.heading, "This job is canceled. No need to go.");
  assert.equal(gone?.title, "Replace back door");
  assert.match(gone?.street ?? "", /^118 Congress St/);
  assert.match(gone?.street ?? "", /Rear$/);
});

test("a contractor taken off a job that goes on is named by first name", () => {
  const gone = goneJobFor({ ...base, contractorHasJob: false });
  assert.equal(gone?.heading, "Zack is no longer on this job. No need to go.");
});

test("canceled wins over taken off, and a job still theirs says nothing", () => {
  assert.equal(goneJobFor({ ...base, canceled: true, contractorHasJob: false })?.heading, "This job is canceled. No need to go.");
  assert.equal(goneJobFor(base), null);
});

test("no street when the job has no building", () => {
  assert.equal(goneJobFor({ ...base, canceled: true, address: null, unitLabel: null })?.street, null);
});

test("a deleted job reads as canceled, from the title and street its note kept", () => {
  const street = goneJobStreet(base.address, base.unitLabel);
  assert.deepEqual(deletedJob({ title: base.title, street }), goneJobFor({ ...base, canceled: true }));
  assert.equal(deletedJob({ title: "Gutters", street: null }).street, null);
});

test("deleting an open or canceled job leaves its crew a note; a Done job or a draft doesn't", () => {
  for (const s of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "CANCELED"] as const) assert.equal(deleteLeavesCrewNote(s), true, s);
  assert.equal(deleteLeavesCrewNote("DONE"), false);
  assert.equal(deleteLeavesCrewNote("DRAFT"), false);
});
