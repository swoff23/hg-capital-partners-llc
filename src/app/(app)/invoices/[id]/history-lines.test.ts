import test from "node:test";
import assert from "node:assert/strict";
import { historyLine, type HistoryEvent } from "./history-lines";

const today = "2026-11-21" as const;
const ev = (kind: HistoryEvent["kind"], data: unknown, actorLabel = "Connor Swofford"): HistoryEvent => ({
  id: "e1",
  kind,
  actorLabel,
  data,
  createdAt: new Date("2026-11-19T15:00:00Z"),
});

test("historyLine: says how an invoice arrived", () => {
  assert.equal(historyLine(ev("ARRIVED", { source: "EMAIL" }, "Email"), today, { fromName: "Zack" }).text, "Came in by email from Zack");
  assert.equal(historyLine(ev("ARRIVED", { source: "EMAIL" }, "Email"), today).text, "Came in by email");
  assert.equal(historyLine(ev("ARRIVED", { source: "STAFF" }), today).text, "Connor added it");
  assert.equal(historyLine(ev("ARRIVED", { source: "PORTAL" }, "Zack Reading"), today).text, "Zack sent it from a job");
});

test("historyLine: words each field edit, a total as dollars and a date as the day", () => {
  assert.equal(historyLine(ev("EDITED", { field: "total", from: null, to: "850.50" }), today).text, "Connor set the total to $850.50");
  assert.equal(historyLine(ev("EDITED", { field: "invoiceDate", from: "2026-11-01", to: "2026-11-18" }), today).text, "Connor set the invoice date to Nov 18");
  assert.equal(historyLine(ev("EDITED", { field: "invoiceNumber", from: "1", to: null }), today).text, "Connor cleared the invoice number");
  assert.equal(historyLine(ev("EDITED", { field: "contractor", from: null, to: "Zack Reading" }), today).text, "Connor set the contractor to Zack Reading");
});

test("historyLine: words a job added or taken off, and keeps edits out of the anchors", () => {
  const add = historyLine(ev("EDITED", { field: "jobs", taskId: "t", added: "Fix leak" }), today);
  assert.equal(add.text, "Connor added the job Fix leak");
  assert.equal(add.kind, "jobs");
  assert.equal(add.anchor, false);
  assert.equal(historyLine(ev("EDITED", { field: "jobs", taskId: "t", removed: "Fix leak" }), today).text, "Connor took off the job Fix leak");
});

test("historyLine: anchors the moves", () => {
  for (const kind of ["APPROVED", "REOPENED", "PAID", "UNDONE", "NOT_INVOICE", "RESTORED", "FILE_ADDED", "ARRIVED"] as const) {
    assert.equal(historyLine(ev(kind, {}), today).anchor, true);
  }
});

test("historyLine: words Paid and its undo without repeating the paid line", () => {
  assert.equal(
    historyLine(ev("PAID", { paidOn: "2026-11-24", method: "BASELANE", note: null }, "Pieter Quinn"), today).text,
    "Pieter marked it paid",
  );
  assert.equal(historyLine(ev("UNDONE", {}), today).text, "Connor moved it back to To pay");
  assert.equal(historyLine(ev("RESTORED", { to: "TO_PAY" }), today).text, "Connor put it back in To pay");
});
