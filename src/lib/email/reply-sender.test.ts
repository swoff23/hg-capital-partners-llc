import test from "node:test";
import assert from "node:assert/strict";
import { contractorFate, type ContractorFacts } from "./reply-sender";

// docs/specs/emails-redesign.md, section 7: replies that can't post must not vanish. The lookups are in
// reply-sender.pg.test.ts.

const onIt: ContractorFacts = { linkRevoked: false, contactActive: true, accountStatus: "ACTIVE", hasAccess: true, taskStatus: "IN_PROGRESS" };

test("a contractor on an open job with their login on posts", () => {
  for (const taskStatus of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] as const) assert.equal(contractorFate({ ...onIt, taskStatus }), "post", taskStatus);
});

test("why a reply can't post, the first that applies", () => {
  assert.equal(contractorFate({ ...onIt, accountStatus: "DISABLED" }), "login-off", "Remove access");
  assert.equal(contractorFate({ ...onIt, accountStatus: null }), "login-off", "no login at all");
  assert.equal(contractorFate({ ...onIt, contactActive: false }), "login-off", "the contact made inactive");
  assert.equal(contractorFate({ ...onIt, hasAccess: false }), "off-task", "taken off the job");
  assert.equal(contractorFate({ ...onIt, taskStatus: "DRAFT" }), "off-task", "a draft gives no one the job");
  assert.equal(contractorFate({ ...onIt, taskStatus: "DONE" }), "closed");
  assert.equal(contractorFate({ ...onIt, taskStatus: "CANCELED" }), "closed");
  assert.equal(contractorFate({ ...onIt, linkRevoked: true }), "old-link", "Sign out everywhere retired the address");
  // Taken off a job that has since closed: off the task says more than closed.
  assert.equal(contractorFate({ ...onIt, hasAccess: false, taskStatus: "DONE" }), "off-task");
  assert.equal(contractorFate({ ...onIt, accountStatus: "DISABLED", hasAccess: false, linkRevoked: true }), "login-off");
});
