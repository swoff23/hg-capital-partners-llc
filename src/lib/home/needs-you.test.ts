import test from "node:test";
import assert from "node:assert/strict";
import {
  PHONE_ROWS,
  baselaneItems,
  duplicateLine,
  signupItems,
  STALE_SYNC_MS,
  capexItem,
  drawItems,
  draftsItem,
  withDraftsItem,
  keyDateItems,
  missingItem,
  moreCount,
  needsYouList,
  quickbooksItem,
  type KeyDateProperty,
} from "./needs-you";

const TODAY = "2026-10-25"; // a Sunday

const property = (over: Partial<KeyDateProperty> = {}): KeyDateProperty => ({
  id: "p1",
  address: "118 Congress St, Buffalo, NY 14213",
  loanMaturityDate: null,
  insuranceRenewalDate: null,
  rentalRegistrationExpiry: null,
  ...over,
});

const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

test("key dates: a loan shows within 90 days, insurance and registration within 60", () => {
  const items = keyDateItems(
    [
      property({ id: "a", loanMaturityDate: utc("2027-01-23") }), // 90 days out
      property({ id: "b", loanMaturityDate: utc("2027-01-24") }), // 91
      property({ id: "c", insuranceRenewalDate: utc("2026-12-24") }), // 60
      property({ id: "d", insuranceRenewalDate: utc("2026-12-25") }), // 61
      property({ id: "e", rentalRegistrationExpiry: utc("2026-12-24") }), // 60
      property({ id: "f", rentalRegistrationExpiry: utc("2026-12-25") }), // 61
    ],
    TODAY,
  );
  assert.deepEqual(
    items.map((i) => i.key),
    ["insurance:c", "registration:e", "loan:a"],
  );
});

test("key dates: past dates count, read late, and lead the list", () => {
  const items = keyDateItems(
    [
      property({ id: "a", insuranceRenewalDate: utc("2026-11-12"), loanMaturityDate: utc("2026-10-19") }),
      property({ id: "b", address: "647 Prospect Ave", rentalRegistrationExpiry: "2024-03-01" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    items.map((i) => [i.key, i.state, i.late, i.dateLabel]),
    [
      ["registration:b", "Late", true, "Mar 1, 2024"],
      ["loan:a", "Late", true, "Oct 19"],
      ["insurance:a", "Due", false, "Nov 12"],
    ],
  );
});

test("key dates: a row names the date, opens the property and shows its short address", () => {
  const [item] = keyDateItems([property({ loanMaturityDate: utc("2026-11-30") })], TODAY);
  assert.deepEqual(item, {
    key: "loan:p1",
    kind: "loan",
    href: "/properties/p1",
    title: "Loan maturity",
    state: "Due",
    detail: "118 Congress St",
    amount: null,
    pastDue: null,
    dateLabel: "Nov 30",
    late: false,
    date: "2026-11-30",
  });
});

test("key dates: none set, nothing to show", () => {
  assert.deepEqual(keyDateItems([property()], TODAY), []);
});

test("capex: this year's total across the properties with spend this year", () => {
  const item = capexItem({
    fromYear: 2026,
    perYear: [32_000, 9_000, 0, 0, 0],
    rows: [
      { perYear: [12_000, 0, 0, 0, 0] },
      { perYear: [8_000, 9_000, 0, 0, 0] },
      { perYear: [0, 0, 0, 0, 0] },
      { perYear: [7_000, 0, 0, 0, 0] },
      { perYear: [5_000, 0, 0, 0, 0] },
    ],
  });
  assert.equal(item?.title, "CapEx in 2026");
  assert.equal(item?.amount, 32_000);
  assert.equal(item?.detail, "across 4 properties");
  assert.equal(item?.href, "/properties#capex");
  assert.equal(item?.state, "Due");
});

test("capex: one property reads singular; nothing due this year is no row", () => {
  assert.equal(capexItem({ fromYear: 2026, perYear: [4_500], rows: [{ perYear: [4_500] }] })?.detail, "across 1 property");
  assert.equal(capexItem({ fromYear: 2026, perYear: [0, 20_000], rows: [{ perYear: [0, 20_000] }] }), null);
  assert.equal(capexItem({ fromYear: 2026, perYear: [], rows: [] }), null);
});

test("capex: the past due clause carries only what's late, and the mark stays warn", () => {
  const item = capexItem({ fromYear: 2026, perYear: [32_000, 0], overdueTotal: 4_000, rows: [{ perYear: [32_000, 0] }] });
  assert.equal(item?.amount, 32_000);
  assert.equal(item?.pastDue, 4_000);
  assert.equal(item?.state, "Due");
  assert.equal(item?.late, false);
  // Due this year but nothing late: no clause.
  assert.equal(capexItem({ fromYear: 2026, perYear: [32_000], overdueTotal: 0, rows: [{ perYear: [32_000] }] })?.pastDue, null);
  assert.equal(capexItem({ fromYear: 2026, perYear: [32_000], rows: [{ perYear: [32_000] }] })?.pastDue, null);
});

const NOW = new Date("2026-10-25T14:00:00Z");

test("quickbooks: never connected or disconnected on purpose says nothing", () => {
  assert.equal(quickbooksItem(null, NOW), null);
  assert.equal(quickbooksItem({ status: "REVOKED", lastSuccessfulSyncAt: null, createdAt: utc("2026-01-01") }, NOW), null);
});

test("quickbooks: a lost link asks for a reconnect, however recent the last sync", () => {
  const item = quickbooksItem({ status: "EXPIRED", lastSuccessfulSyncAt: NOW, createdAt: utc("2026-01-01") }, NOW);
  assert.equal(item?.kind, "sync-lost");
  assert.equal(item?.state, "Expired");
  assert.equal(item?.detail, "Reconnect to keep syncing");
  assert.equal(item?.href, "/financials/settings");
});

test("quickbooks: stale only once the last good sync is over 3 days old", () => {
  const at = (ms: number) => ({ status: "ACTIVE" as const, lastSuccessfulSyncAt: new Date(NOW.getTime() - ms), createdAt: utc("2026-01-01") });
  assert.equal(quickbooksItem(at(STALE_SYNC_MS), NOW), null);
  const stale = quickbooksItem(at(STALE_SYNC_MS + 60_000), NOW);
  assert.equal(stale?.kind, "sync-stale");
  assert.equal(stale?.state, "Stale");
  // 3 days and a minute before 10am Eastern on Oct 25 is the morning of Oct 22.
  assert.equal(stale?.detail, "Last synced Oct 22");
});

test("quickbooks: the last sync's day is Buffalo's, not UTC's", () => {
  // 01:30 UTC on Oct 20 is 9:30pm on Oct 19 in Buffalo.
  const item = quickbooksItem({ status: "ACTIVE", lastSuccessfulSyncAt: new Date("2026-10-20T01:30:00Z"), createdAt: utc("2026-01-01") }, NOW);
  assert.equal(item?.detail, "Last synced Oct 19");
});

test("quickbooks: a connection that never synced counts from when it was made", () => {
  const fresh = { status: "ACTIVE" as const, lastSuccessfulSyncAt: null, createdAt: new Date(NOW.getTime() - 60 * 60_000) };
  assert.equal(quickbooksItem(fresh, NOW), null);
  const old = { ...fresh, createdAt: utc("2026-10-01") };
  assert.equal(quickbooksItem(old, NOW)?.detail, "Never synced");
});

test("the list: key dates, then CapEx, then QuickBooks", () => {
  const keyDates = keyDateItems([property({ loanMaturityDate: utc("2026-11-30") })], TODAY);
  const capex = capexItem({ fromYear: 2026, perYear: [1_000], rows: [{ perYear: [1_000] }] });
  const quickbooks = quickbooksItem({ status: "EXPIRED", lastSuccessfulSyncAt: null, createdAt: utc("2026-01-01") }, NOW);
  assert.deepEqual(
    needsYouList({ keyDates, capex, quickbooks }).map((i) => i.key),
    ["loan:p1", "capex", "quickbooks"],
  );
  assert.deepEqual(needsYouList({ keyDates: [], capex: null, quickbooks: null }), []);
});

test("phones: three rows, then the rest behind N more", () => {
  assert.equal(PHONE_ROWS, 3);
  assert.equal(moreCount(2), 0);
  assert.equal(moreCount(3), 0);
  assert.equal(moreCount(5), 2);
});

// Contractor onboarding rows (docs/specs/contractor-onboarding.md, 4.5)

const signup = (over: Partial<Parameters<typeof signupItems>[0][number]> = {}) => ({
  id: "c1",
  fullName: "Tony Bell",
  phoneE164: "+17165550101",
  email: "tony@example.com",
  trades: "Electric, Handyman",
  createdAt: new Date("2026-11-13T15:00:00Z"),
  ...over,
});

test("a sign-up reads 'Tony Bell signed up' over its trades and the link", () => {
  const [row] = signupItems([signup()], []);
  assert.equal(row.title, "Tony Bell signed up");
  assert.equal(row.detail, "Electric, Handyman · with your sign-up link");
  assert.equal(row.href, "/contractors/c1");
  assert.equal(row.actions, "signup");
  assert.equal(row.contactId, "c1");
});

test("a sign-up with no trades says only where it came from", () => {
  assert.equal(signupItems([signup({ trades: null })], [])[0].detail, "with your sign-up link");
});

test("a sign-up sharing a mobile or an email says who, phone first, ignoring case and itself", () => {
  const zack = { id: "z", fullName: "Zack Reading", phoneE164: "+17165550101", email: null };
  const amy = { id: "a", fullName: "Amy Lee", phoneE164: null, email: "TONY@example.com" };
  assert.equal(duplicateLine(signup(), [amy, zack]), "Same phone as Zack Reading");
  assert.equal(duplicateLine(signup(), [amy]), "Same email as Amy Lee");
  assert.equal(duplicateLine(signup(), [{ id: "c1", fullName: "Tony Bell", phoneE164: "+17165550101", email: null }]), null);
  assert.equal(duplicateLine(signup({ phoneE164: null, email: null }), [{ ...zack, phoneE164: null }]), null);
  assert.equal(signupItems([signup()], [zack])[0].detail, "Same phone as Zack Reading");
});

test("sign-ups go oldest first", () => {
  const rows = signupItems([signup({ id: "b", createdAt: new Date("2026-11-14T10:00:00Z") }), signup({ id: "a" })], []);
  assert.deepEqual(rows.map((r) => r.key), ["signup:a", "signup:b"]);
});

test("a Baselane row names the person and the day they finished setup", () => {
  const rows = baselaneItems(
    [
      { id: "d", fullName: "Dana Fox", setupDoneAt: new Date("2026-11-14T15:00:00Z") },
      { id: "e", fullName: "Eli Park", setupDoneAt: new Date("2026-11-10T15:00:00Z") },
    ],
    "2026-11-14",
  );
  assert.deepEqual(rows.map((r) => [r.title, r.detail]), [
    ["Send Eli Park the Baselane link", "Finished setup Nov 10"],
    ["Send Dana Fox the Baselane link", "Finished setup today"],
  ]);
  assert.equal(rows[0].actions, "baselane");
});

test("the list puts sign-ups and Baselane rows after key dates and before CapEx", () => {
  const signups = signupItems([signup()], []);
  const baselane = baselaneItems([{ id: "d", fullName: "Dana Fox", setupDoneAt: new Date("2026-11-14T15:00:00Z") }], "2026-11-14");
  const capex = capexItem({ fromYear: 2026, perYear: [1000], rows: [{ perYear: [1000] }] });
  const keyDates = keyDateItems([property({ loanMaturityDate: utc("2026-11-30") })], "2026-11-14");
  const list = needsYouList({ keyDates, signups, baselane, capex, quickbooks: null });
  assert.deepEqual(list.map((i) => i.kind), ["loan", "signup", "baselane", "capex"]);
});

test("Missing info: one row with the required count and where, opening the worklist; none at zero", () => {
  assert.equal(missingItem(0, ""), null);
  const row = missingItem(1177, "11 properties, 8 contractors")!;
  assert.equal(row.kind, "missing");
  assert.equal(row.href, "/missing");
  assert.equal(row.title, "Missing info");
  assert.equal(row.state, "Missing");
  assert.equal(row.detail, "1,177 to fill in · 11 properties, 8 contractors");
  assert.equal(missingItem(3, "")!.detail, "3 to fill in");
});

test("the list: key dates and lease ends by date, then sign-ups, Baselane, Missing info, CapEx, QuickBooks", () => {
  const dated = (key: string, date: string) => ({ ...missingItem(1, "")!, key, kind: "loan" as const, title: key, detail: key, date });
  const list = needsYouList({
    keyDates: [dated("loan", "2026-12-01")],
    leaseEnds: [{ ...dated("lease", "2026-11-20"), kind: "lease" as const }],
    missing: missingItem(5, "2 properties"),
    capex: null,
    quickbooks: null,
  });
  assert.deepEqual(
    list.map((i) => i.key),
    ["lease", "loan", "missing"],
  );
});

// ---------------------------------------------------------------------------
// Rehab draws (docs/specs/rehab-draws.md, R11)
// ---------------------------------------------------------------------------

test("a maturing loan says how much its open rehab still holds back", () => {
  const p = property({ loanMaturityDate: "2026-12-01" });
  const [plain] = keyDateItems([p], TODAY);
  assert.equal(plain.detail, "118 Congress St");
  const [held] = keyDateItems([p], TODAY, new Map([["p1", 52100]]));
  assert.equal(held.detail, "118 Congress St · $52,100 not drawn");
  const [none] = keyDateItems([p], TODAY, new Map([["p1", 0]]));
  assert.equal(none.detail, "118 Congress St");
});

test("draws: the longest stuck first; drafts and draws that moved lately stay off", () => {
  const draw = (number: number, stage: "DRAFT" | "SENT" | "INSPECTION" | "APPROVED" | "FUNDED", changed: string) => ({ number, stage, stageChangedAt: changed });
  const items = drawItems(
    [
      { id: "r1", name: "58 Mariner Street", draws: [draw(1, "SENT", "2026-10-08T15:00:00Z")] },
      { id: "r2", name: "415 Crescent Ave.", draws: [draw(2, "INSPECTION", "2026-10-24T15:00:00Z"), draw(1, "FUNDED", "2026-09-01T15:00:00Z")] },
      { id: "r3", name: "23 Sherwood St", draws: [draw(4, "INSPECTION", "2026-10-20T15:00:00Z"), draw(5, "DRAFT", "2026-09-01T15:00:00Z"), draw(3, "APPROVED", "2026-10-12T15:00:00Z")] },
    ],
    TODAY,
  );
  assert.deepEqual(
    items.map((i) => [i.key, i.state, i.title, i.detail, i.href]),
    [
      ["draw-stuck:r1:1", "Stuck", "58 Mariner Street · draw 1", "No change in 17 days · Sent", "/draws/r1"],
      ["draw-stuck:r3:3", "Stuck", "23 Sherwood St · draw 3", "No change in 13 days · Approved", "/draws/r3"],
    ],
  );
});

test("draw rows sit after the dated rows and before sign-ups", () => {
  const dated = keyDateItems([property({ loanMaturityDate: "2026-11-01" })], TODAY);
  const draws = drawItems([{ id: "r", name: "1 A St", draws: [{ number: 1, stage: "SENT", stageChangedAt: "2026-10-01T15:00:00Z" }] }], TODAY);
  const list = needsYouList({ keyDates: dated, draws, capex: null, quickbooks: null });
  assert.deepEqual(list.map((i) => i.kind), ["loan", "draw"]);
  assert.equal(list[1].detail, "No change in 24 days · Sent");
});

test("drafts row: one row with your own count, none at zero", () => {
  assert.equal(draftsItem(0), null);
  const row = draftsItem(3)!;
  assert.equal(row.kind, "drafts");
  assert.equal(row.title, "Drafts from Claude");
  assert.equal(row.href, "/tasks");
  assert.equal(row.detail, "3 to add");
});

test("drafts row: first in the list, ahead of the key dates, so a phone's three rows never hide it; with none the list is as it was", () => {
  const dated = keyDateItems([property({ id: "a", loanMaturityDate: utc("2026-11-30") })], TODAY);
  const missing = missingItem(2, "")!;
  const base = needsYouList({ keyDates: dated, capex: null, quickbooks: null, missing });
  assert.deepEqual(withDraftsItem(base, 0), base);
  assert.deepEqual(withDraftsItem(base, 2).map((i) => i.kind), ["drafts", "loan", "missing"]);
  assert.deepEqual(withDraftsItem([missing], 1).map((i) => i.kind), ["drafts", "missing"]);
  assert.deepEqual(withDraftsItem([], 1).map((i) => i.kind), ["drafts"]);
});
