import test from "node:test";
import assert from "node:assert/strict";
import {
  accountStatus,
  furthestStep,
  inSetup,
  inviteState,
  inviteTextBody,
  nextSetupStep,
  onboardingStatus,
  setupChecklist,
  setupComplete,
  setupProgressLine,
  stepSaved,
  type OnboardingFacts,
  type SetupFacts,
} from "./onboarding";

const base: OnboardingFacts = { signupSource: "INVITE", needsReview: false, setupDoneAt: null, hasLogin: false, inviteOpened: false };

test("anyone staff added is never in setup and carries no badge", () => {
  assert.equal(onboardingStatus({ ...base, signupSource: "STAFF" }), null);
  assert.equal(onboardingStatus({ ...base, signupSource: "STAFF", hasLogin: true }), null);
  assert.equal(inSetup({ signupSource: "STAFF", setupDoneAt: null }), false);
});

test("an invite goes Invited, Opened, Onboarding, then no badge", () => {
  assert.equal(onboardingStatus(base), "invited");
  assert.equal(onboardingStatus({ ...base, inviteOpened: true }), "opened");
  assert.equal(onboardingStatus({ ...base, inviteOpened: true, hasLogin: true }), "onboarding");
  assert.equal(onboardingStatus({ ...base, hasLogin: true, setupDoneAt: new Date() }), null);
});

test("a sign-up from the shared link is New until kept, even mid-setup", () => {
  const link = { ...base, signupSource: "LINK" as const, hasLogin: true, needsReview: true };
  assert.equal(onboardingStatus(link), "new");
  assert.equal(onboardingStatus({ ...link, needsReview: false }), "onboarding");
});

test("the list's status: New, then Access off, then the setup step, then the login's state", () => {
  assert.equal(accountStatus("new", "off"), "new");
  assert.equal(accountStatus("onboarding", "off"), "off");
  assert.equal(accountStatus("onboarding", "active"), "onboarding");
  assert.equal(accountStatus("invited", null), "invited");
  assert.equal(accountStatus(null, "active"), "active");
  assert.equal(accountStatus(null, "invited"), "invited");
  assert.equal(accountStatus(null, null), null);
});

test("steps run details, trades, W-9, insurance; Back never moves progress back", () => {
  assert.equal(nextSetupStep(null), "details");
  assert.equal(nextSetupStep("details"), "trades");
  assert.equal(nextSetupStep("insurance"), null);
  assert.equal(nextSetupStep("junk"), "details");
  assert.equal(furthestStep("w9", "details"), "w9");
  assert.equal(furthestStep(null, "details"), "details");
  assert.equal(stepSaved("w9", "trades"), true);
  assert.equal(stepSaved("details", "w9"), false);
});

test("the progress line names the step they're on", () => {
  assert.equal(setupProgressLine(null), "Your details · 2 of 6");
  assert.equal(setupProgressLine("trades"), "W-9 · 4 of 6");
  assert.equal(setupProgressLine("w9"), "Insurance · 5 of 6");
});

const facts: SetupFacts = {
  fullName: "Dana Fox",
  phone: "(716) 555-0142",
  mailingAddress: "12 Elm St, Buffalo, NY 14201",
  tradeCount: 1,
  tradesNote: null,
  setupStep: "w9",
  w9Count: 1,
  insuranceCount: 0,
  noInsurance: false,
};

test("done is details, trades and a W-9; insurance is optional", () => {
  assert.equal(setupComplete(facts), true);
  assert.equal(setupChecklist(facts).insurance, false);
  assert.equal(setupComplete({ ...facts, w9Count: 0 }), false);
  assert.equal(setupComplete({ ...facts, mailingAddress: " " }), false, "the mailing address is required");
  assert.equal(setupComplete({ ...facts, tradeCount: 0, tradesNote: "Gutters" }), true, "the didn't-list line counts as trades");
  assert.equal(setupComplete({ ...facts, setupStep: "details" }), false, "trades aren't done until the step (and its tenant question) is saved");
  assert.equal(setupChecklist({ ...facts, noInsurance: true }).insurance, true);
});

test("a personal invite works once and for its 14 days; the shared link until reset", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const later = new Date("2026-11-20T12:00:00Z");
  const past = new Date("2026-11-14T12:00:00Z");
  assert.equal(inviteState({ usedAt: null, expiresAt: later, shared: false }, now), "live");
  assert.equal(inviteState({ usedAt: past, expiresAt: later, shared: false }, now), "used");
  assert.equal(inviteState({ usedAt: null, expiresAt: past, shared: false }, now), "expired");
  assert.equal(inviteState({ usedAt: null, expiresAt: null, shared: true }, now), "live");
  assert.equal(inviteState({ usedAt: null, expiresAt: past, shared: true }, now), "expired");
});

test("the invite text says HG Capital and who it's from", () => {
  assert.equal(
    inviteTextBody({ contractorFirstName: "Mike", senderFirstName: "Connor", link: "https://hgcapitalpartners.com/join/abc" }),
    "Hi Mike, it's Connor at HG Capital. Set up your contractor account here: https://hgcapitalpartners.com/join/abc",
  );
});
