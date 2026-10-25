import test from "node:test";
import assert from "node:assert/strict";
import { oauthReturnLine, partialSyncLine, reconcileGap, reconcileLine } from "./notices";

const tied = {
  sumToWhole: { ok: true, deltaCents: 0 },
  netIncomeIdentity: { ok: true, deltaCents: 0 },
  noiVsQbo: { ok: true, residualCents: 0 },
  cellMismatches: [],
};

test("reconcileGap: the review's case, NOI $2,916 off on Cash", () => {
  const rec = { CASH: { ...tied, noiVsQbo: { ok: false, residualCents: -291_600 } }, ACCRUAL: tied };
  const gap = reconcileGap(rec, "CASH");
  assert.deepEqual(gap, { kind: "noi", cents: -291_600 });
  assert.equal(partialSyncLine(gap, "Sep 2, 2026"), "NOI is $2,916 off from QuickBooks as of Sep 2, 2026.");
});

test("reconcileGap: the basis on screen ties even though the other one doesn't", () => {
  const rec = { CASH: tied, ACCRUAL: { ...tied, noiVsQbo: { ok: false, residualCents: 5_000 } } };
  assert.deepEqual(reconcileGap(rec, "CASH"), { kind: "ok" });
  assert.equal(partialSyncLine({ kind: "ok" }, "Sep 2, 2026"), null);
  assert.deepEqual(reconcileGap(rec, "ACCRUAL"), { kind: "noi", cents: 5_000 });
});

test("reconcileGap: no reconciliation for the basis means the run didn't finish", () => {
  assert.deepEqual(reconcileGap({}, "CASH"), { kind: "incomplete" });
  assert.deepEqual(reconcileGap(null, "CASH"), { kind: "incomplete" });
  assert.equal(
    partialSyncLine({ kind: "incomplete" }, "Sep 2, 2026"),
    "The last sync didn't finish, so these figures may not match QuickBooks.",
  );
});

test("reconcileGap: net income, then per-cell, when NOI ties", () => {
  const whole = { CASH: { ...tied, sumToWhole: { ok: false, deltaCents: 12_345 } } };
  assert.deepEqual(reconcileGap(whole, "CASH"), { kind: "net", cents: 12_345 });
  const identity = { CASH: { ...tied, netIncomeIdentity: { ok: false, deltaCents: -40_000 } } };
  assert.equal(
    partialSyncLine(reconcileGap(identity, "CASH"), "Oct 1, 2026"),
    "Net income is $400 off from QuickBooks as of Oct 1, 2026.",
  );
  const cells = { CASH: { ...tied, cellMismatches: [{}, {}, {}] } };
  assert.equal(
    partialSyncLine(reconcileGap(cells, "CASH"), "Oct 1, 2026"),
    "3 account totals don't match QuickBooks as of Oct 1, 2026.",
  );
  assert.equal(
    partialSyncLine({ kind: "cells", count: 1 }, "Oct 1, 2026"),
    "1 account total doesn't match QuickBooks as of Oct 1, 2026.",
  );
});

test("partialSyncLine: 'to the cent' only when the gap is under $1", () => {
  assert.equal(
    partialSyncLine({ kind: "noi", cents: -99 }, "Sep 2, 2026"),
    "NOI doesn't tie to QuickBooks to the cent as of Sep 2, 2026.",
  );
  assert.equal(
    partialSyncLine({ kind: "noi", cents: 100 }, "Sep 2, 2026"),
    "NOI is $1 off from QuickBooks as of Sep 2, 2026.",
  );
});

test("oauthReturnLine: one line per way the Intuit round trip ends", () => {
  assert.equal(oauthReturnLine({}), null);
  assert.deepEqual(oauthReturnLine({ connected: "1" }), {
    tone: "info",
    text: "Connected to QuickBooks. A full sync is running now.",
    retry: false,
  });
  assert.deepEqual(oauthReturnLine({ error: "access_denied" }), {
    tone: "info",
    text: "Connection cancelled. Nothing changed.",
    retry: true,
  });
  assert.deepEqual(oauthReturnLine({ error: "state_mismatch" }), {
    tone: "error",
    text: "That sign-in expired.",
    retry: true,
  });
  for (const code of ["token_exchange_failed", "missing_params", "something_new"]) {
    assert.deepEqual(oauthReturnLine({ error: code }), {
      tone: "error",
      text: "QuickBooks didn't finish connecting.",
      retry: true,
    });
  }
  // an error wins over a stray connected flag
  assert.equal(oauthReturnLine({ connected: "1", error: ["access_denied"] })?.text, "Connection cancelled. Nothing changed.");
});

test("reconcileLine: the review's case, Accrual NOI $50 off while Cash ties", () => {
  const rec = { CASH: tied, ACCRUAL: { ...tied, noiVsQbo: { ok: false, residualCents: -5_000 } } };
  assert.equal(
    reconcileLine(rec, "ACCRUAL"),
    "Accrual reconciliation: NOI off by $50 · net income ✓ · account totals ✓",
  );
  assert.equal(reconcileLine(rec, "CASH"), "Cash reconciliation: NOI ✓ · net income ✓ · account totals ✓");
});

test("reconcileLine: names what the banner names, net income from either check", () => {
  const whole = { CASH: { ...tied, sumToWhole: { ok: false, deltaCents: 12_345 } } };
  assert.equal(
    reconcileLine(whole, "CASH"),
    "Cash reconciliation: NOI ✓ · net income off by $123 · account totals ✓",
  );
  const identity = { CASH: { ...tied, netIncomeIdentity: { ok: false, deltaCents: -40 } } };
  assert.equal(
    reconcileLine(identity, "CASH"),
    "Cash reconciliation: NOI ✓ · net income off by under $1 · account totals ✓",
  );
  assert.equal(
    reconcileLine({ CASH: { ...tied, cellMismatches: [{}] } }, "CASH"),
    "Cash reconciliation: NOI ✓ · net income ✓ · 1 account total doesn't match",
  );
  assert.equal(
    reconcileLine({ CASH: { ...tied, cellMismatches: [{}, {}, {}] } }, "CASH"),
    "Cash reconciliation: NOI ✓ · net income ✓ · 3 account totals don't match",
  );
});

test("reconcileLine: null when the run has no reconciliation for the basis", () => {
  assert.equal(reconcileLine({ CASH: tied }, "ACCRUAL"), null);
  assert.equal(reconcileLine({}, "CASH"), null);
  assert.equal(reconcileLine(null, "CASH"), null);
});
