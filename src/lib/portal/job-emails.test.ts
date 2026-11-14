import test from "node:test";
import assert from "node:assert/strict";
import { JOB_EMAIL_SELECT, jobEmailState } from "./job-emails";

// docs/specs/contractor-email-switch.md: a task email goes when the login is active, they have signed in
// at least once, and their Job emails switch is on.

const signedIn = new Date("2026-11-14T15:00:00Z");
const login = { status: "ACTIVE", lastSignInAt: signedIn, jobEmails: true };

test("on: an active login that has signed in, with the switch on", () => {
  assert.equal(jobEmailState(login), "on");
  // The first sign-in can arrive as the ISO string a page passes along.
  assert.equal(jobEmailState({ ...login, lastSignInAt: signedIn.toISOString() }), "on");
});

test("quiet until the first sign-in, whichever way the switch is set", () => {
  assert.equal(jobEmailState({ ...login, lastSignInAt: null }), "not-signed-in");
  assert.equal(jobEmailState({ ...login, lastSignInAt: null, jobEmails: false }), "not-signed-in");
});

test("off: signed in, with the switch off", () => {
  assert.equal(jobEmailState({ ...login, jobEmails: false }), "off");
});

test("no login comes first: none, access removed, or an inactive contact", () => {
  assert.equal(jobEmailState(null), "no-login");
  assert.equal(jobEmailState(undefined), "no-login");
  assert.equal(jobEmailState({ ...login, status: "DISABLED" }), "no-login");
  assert.equal(jobEmailState({ ...login, status: "DISABLED", jobEmails: false, lastSignInAt: null }), "no-login");
  assert.equal(jobEmailState(login, false), "no-login");
});

test("the select reads exactly the three facts the rule uses, and never the password hash", () => {
  assert.deepEqual(Object.keys(JOB_EMAIL_SELECT).sort(), ["jobEmails", "lastSignInAt", "status"]);
});
