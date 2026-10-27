import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_MAX_MS,
  BUNDLE_QUIET_MS,
  bundleSendAfter,
  canSetStatus,
  contractorSeesRow,
  notifyAudience,
  statusEventVisibility,
  targetDate,
  targetIsVisit,
  writeAudience,
} from "./rules";

test("staff can make any status change; nobody can 'change' to the same status", () => {
  assert.equal(canSetStatus("staff", "REVIEW", "DONE"), true);
  assert.equal(canSetStatus("staff", "DONE", "OPEN"), true);
  assert.equal(canSetStatus("staff", "OPEN", "CANCELED"), true);
  assert.equal(canSetStatus("staff", "OPEN", "OPEN"), false);
});

test("contractors can only Start job and Mark done", () => {
  assert.equal(canSetStatus("contractor", "OPEN", "IN_PROGRESS"), true);
  assert.equal(canSetStatus("contractor", "SCHEDULED", "IN_PROGRESS"), true);
  assert.equal(canSetStatus("contractor", "IN_PROGRESS", "REVIEW"), true);
  assert.equal(canSetStatus("contractor", "OPEN", "REVIEW"), true);
  // Not: approve, cancel, reopen, or undo a Mark done.
  assert.equal(canSetStatus("contractor", "REVIEW", "DONE"), false);
  assert.equal(canSetStatus("contractor", "OPEN", "CANCELED"), false);
  assert.equal(canSetStatus("contractor", "DONE", "IN_PROGRESS"), false);
  assert.equal(canSetStatus("contractor", "REVIEW", "IN_PROGRESS"), false);
  assert.equal(canSetStatus("contractor", "OPEN", "WAITING"), false);
  assert.equal(canSetStatus("contractor", "OPEN", "SCHEDULED"), false);
});

test("status events reach contractors only for the states they care about", () => {
  assert.equal(statusEventVisibility("SCHEDULED", true), "SHARED");
  assert.equal(statusEventVisibility("DONE", true), "SHARED");
  assert.equal(statusEventVisibility("WAITING", true), "INTERNAL");
  assert.equal(statusEventVisibility("CANCELED", true), "INTERNAL");
  assert.equal(statusEventVisibility("DONE", false), "INTERNAL");
});

test("staff and system writes are addressed to the contractor assigned at the time", () => {
  assert.equal(writeAudience("staff", "zack"), "zack");
  assert.equal(writeAudience("system", "zack"), "zack");
  assert.equal(writeAudience("staff", null), null);
  // A contractor's own row says whose it is; imported history stays open to the assignee (D17).
  assert.equal(writeAudience("contractor", "zack"), null);
  assert.equal(writeAudience("asana", "zack"), null);
});

test("a staff reply to one contractor never reaches the next one on the job", () => {
  const staff = { imported: false, actorContactId: null };
  // Written to Zack: Zack sees it, Jose (who got the job next) doesn't.
  assert.equal(contractorSeesRow({ ...staff, audienceContactId: "zack" }, "zack"), true);
  assert.equal(contractorSeesRow({ ...staff, audienceContactId: "zack" }, "jose"), false);
  // Written while no contractor had the job: whoever gets it sees it.
  assert.equal(contractorSeesRow({ ...staff, audienceContactId: null }, "jose"), true);
  // Their own rows only, never another contractor's.
  assert.equal(contractorSeesRow({ imported: false, actorContactId: "jose", audienceContactId: null }, "jose"), true);
  assert.equal(contractorSeesRow({ imported: false, actorContactId: "zack", audienceContactId: null }, "jose"), false);
  // Imported Asana history stays visible, whoever wrote it (D17).
  assert.equal(contractorSeesRow({ imported: true, actorContactId: "zack", audienceContactId: null }, "jose"), true);
  assert.equal(contractorSeesRow({ imported: true, actorContactId: null, audienceContactId: null }, "jose"), true);
});

test("targetDate: visit date while Scheduled, otherwise due", () => {
  const due = new Date("2026-10-30T00:00:00Z");
  const visit = new Date("2026-10-27T00:00:00Z");
  assert.equal(targetDate({ status: "SCHEDULED", scheduledFor: visit, dueDate: due }), visit);
  assert.equal(targetDate({ status: "IN_PROGRESS", scheduledFor: visit, dueDate: due }), due);
  assert.equal(targetDate({ status: "SCHEDULED", scheduledFor: null, dueDate: due }), due);
  // The portal labels it to match: "Visit date" only when that's the date shown.
  assert.equal(targetIsVisit({ status: "SCHEDULED", scheduledFor: visit }), true);
  assert.equal(targetIsVisit({ status: "IN_PROGRESS", scheduledFor: visit }), false);
  assert.equal(targetIsVisit({ status: "SCHEDULED", scheduledFor: null }), false);
});

test("email only crosses the staff/contractor line", () => {
  const login = { contractorHasLogin: true };
  // Staff -> contractor
  assert.equal(notifyAudience("staff", { kind: "COMMENT", visibility: "SHARED" }, login), "contractor");
  assert.equal(notifyAudience("staff", { kind: "COMMENT", visibility: "INTERNAL" }, login), null);
  assert.equal(notifyAudience("staff", { kind: "ASSIGNED", visibility: "INTERNAL" }, login), "contractor");
  assert.equal(notifyAudience("staff", { kind: "TARGET", visibility: "INTERNAL" }, login), "contractor");
  assert.equal(notifyAudience("staff", { kind: "STATUS", visibility: "SHARED" }, login), "contractor");
  assert.equal(notifyAudience("staff", { kind: "STATUS", visibility: "INTERNAL" }, login), null);
  assert.equal(notifyAudience("staff", { kind: "TITLE", visibility: "INTERNAL" }, login), null);
  assert.equal(notifyAudience("staff", { kind: "COMMENT", visibility: "SHARED" }, { contractorHasLogin: false }), null);
  // Contractor -> staff
  assert.equal(notifyAudience("contractor", { kind: "COMMENT", visibility: "SHARED" }, login), "staff");
  assert.equal(notifyAudience("contractor", { kind: "ATTACHMENT", visibility: "SHARED" }, login), "staff");
  assert.equal(notifyAudience("contractor", { kind: "STATUS", visibility: "SHARED" }, login), "staff");
  assert.equal(notifyAudience("contractor", { kind: "CHECKLIST", visibility: "SHARED" }, login), null);
  // Nobody else emails
  assert.equal(notifyAudience("system", { kind: "COMMENT", visibility: "SHARED" }, login), null);
  assert.equal(notifyAudience("asana", { kind: "COMMENT", visibility: "SHARED" }, login), null);
});

test("bundleSendAfter: 3 minutes after the latest change, at most 10 after the first", () => {
  const first = new Date("2026-10-29T15:00:00Z");
  assert.equal(bundleSendAfter(first, first).getTime(), first.getTime() + BUNDLE_QUIET_MS);
  const later = new Date(first.getTime() + 5 * 60_000);
  assert.equal(bundleSendAfter(first, later).getTime(), later.getTime() + BUNDLE_QUIET_MS);
  const muchLater = new Date(first.getTime() + 9 * 60_000);
  assert.equal(bundleSendAfter(first, muchLater).getTime(), first.getTime() + BUNDLE_MAX_MS);
});
