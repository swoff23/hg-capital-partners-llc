import test from "node:test";
import assert from "node:assert/strict";
import { leaseEnd, leaseEndItems, noticeDays, noticeLine, type LeaseEndInput } from "./lease-notice";

const lease = (over: Partial<LeaseEndInput> = {}): LeaseEndInput => ({
  id: "l1",
  address: "767 Prospect Avenue, Buffalo, NY 14213",
  unitLabel: "Front",
  movesIn: "2025-01-01",
  movesOut: null,
  terms: [{ id: "t1", startsOn: "2025-04-01", endsOn: "2026-03-31" }],
  ...over,
});

test("New York's notice: 30 days under a year, 60 for one to two, 90 past two or unknown", () => {
  assert.equal(noticeDays("2025-06-01", "2026-03-31"), 30);
  assert.equal(noticeDays("2025-03-31", "2026-03-31"), 60, "a full year is one to two years");
  assert.equal(noticeDays("2024-04-01", "2026-03-31"), 60);
  assert.equal(noticeDays("2024-03-31", "2026-03-31"), 90);
  assert.equal(noticeDays(null, "2026-03-31"), 90);
});

test("the deadline and the day the row shows", () => {
  const e = leaseEnd(lease(), "2026-01-01")!;
  assert.equal(e.endsOn, "2026-03-31");
  assert.equal(e.noticeBy, "2026-01-30", "60 days before, for a stay of one to two years");
  assert.equal(e.showFrom, "2025-12-31");
  assert.equal(e.late, false);
  assert.equal(leaseEnd(lease(), "2026-01-31")!.late, true);
});

test("nothing to decide: moving out, month to month, renewed, or past", () => {
  assert.equal(leaseEnd(lease({ movesOut: "2026-03-31" }), "2026-01-01"), null);
  assert.equal(leaseEnd(lease({ terms: [{ id: "t1", startsOn: "2025-04-01", endsOn: null }] }), "2026-01-01"), null);
  const renewed = lease({
    terms: [
      { id: "t1", startsOn: "2025-04-01", endsOn: "2026-03-31" },
      { id: "t2", startsOn: "2026-04-01", endsOn: null },
    ],
  });
  assert.equal(leaseEnd(renewed, "2026-01-01"), null);
  assert.equal(leaseEnd(lease({ movesOut: "2025-12-01" }), "2026-01-01"), null);
  assert.equal(leaseEnd(lease({ terms: [] }), "2026-01-01"), null);
});

test("Needs you rows: in the window only, Late after the deadline, past the end reads Lease ended", () => {
  assert.deepEqual(leaseEndItems([lease()], "2025-12-30"), [], "a day before the window");
  const [due] = leaseEndItems([lease()], "2025-12-31");
  assert.equal(due.kind, "lease");
  assert.equal(due.title, "Lease ends Mar 31, 2026", "next year carries its year");
  assert.equal(due.detail, "767 Prospect Avenue · Front");
  assert.equal(due.state, "Due");
  assert.equal(due.dateLabel, "Jan 30, 2026");
  assert.equal(due.href, "/tenants/l1");
  const [late] = leaseEndItems([lease()], "2026-02-01");
  assert.equal(late.state, "Late");
  assert.equal(late.late, true);
  const [ended] = leaseEndItems([lease()], "2026-04-02");
  assert.equal(ended.title, "Lease ended Mar 31");
  assert.deepEqual(leaseEndItems([lease()], "2026-02-01", new Set(["term:t1"])), [], "Doesn't apply on the term");
});

test("the lease page's line", () => {
  assert.equal(noticeLine(leaseEnd(lease(), "2026-01-01")!, "2026-01-01"), "Notice by Jan 30");
  assert.equal(noticeLine(leaseEnd(lease(), "2026-02-01")!, "2026-02-01"), "Notice was due Jan 30");
});
