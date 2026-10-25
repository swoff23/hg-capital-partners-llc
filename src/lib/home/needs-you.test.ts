import test from "node:test";
import assert from "node:assert/strict";
import {
  PHONE_ROWS,
  STALE_SYNC_MS,
  capexItem,
  dayLabel,
  keyDateItems,
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

test("dayLabel: Today, Tomorrow, a weekday within six days, then the date", () => {
  assert.equal(dayLabel("2026-10-25", TODAY), "Today");
  assert.equal(dayLabel("2026-10-26", TODAY), "Tomorrow");
  assert.equal(dayLabel("2026-10-27", TODAY), "Tue");
  assert.equal(dayLabel("2026-10-31", TODAY), "Sat");
  assert.equal(dayLabel("2026-11-01", TODAY), "Nov 1");
  assert.equal(dayLabel("2027-01-05", TODAY), "Jan 5, 2027");
});

test("dayLabel: a past date is the real date, never a weekday", () => {
  assert.equal(dayLabel("2026-10-24", TODAY), "Oct 24");
  assert.equal(dayLabel("2026-10-19", TODAY), "Oct 19");
  assert.equal(dayLabel("2025-12-30", TODAY), "Dec 30, 2025");
});

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
