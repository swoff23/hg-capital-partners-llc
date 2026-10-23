import test from "node:test";
import assert from "node:assert/strict";
import { changedFields, fieldText, isAtVersion, sameText, staleFields } from "./edits";

test("fieldText: a stored value as its form field holds it", () => {
  assert.equal(fieldText(null), "");
  assert.equal(fieldText(undefined), "");
  assert.equal(fieldText("Vontive"), "Vontive");
  assert.equal(fieldText(2300), "2300");
  assert.equal(fieldText(new Date("2027-03-01T00:00:00.000Z")), "2027-03-01");
  assert.equal(fieldText(true), "yes");
  assert.equal(fieldText(false), "no");
  // A Prisma Decimal prints the way the page passes it to the form.
  assert.equal(fieldText({ toString: () => "292890" }), "292890");
});

test("sameText: line endings and the ends don't count as a change", () => {
  assert.ok(sameText("Roof done.\r\nGutters next.", "Roof done.\nGutters next."));
  assert.ok(sameText(" Vontive ", "Vontive"));
  assert.ok(!sameText("6.5", "6.875"));
});

test("changedFields: only what differs from what was loaded is sent, with the loaded value", () => {
  const loaded = { id: "p1", version: "v1", lender: "Vontive", loanRate: "6.875", loanNumber: null, loanMaturityDate: "2027-03-01", loanEscrow: false };
  const submitted = { lender: "Vontive", loanRate: "7.25", loanNumber: "", loanMaturityDate: "2027-03-01", loanEscrow: "yes" };
  assert.deepEqual(changedFields(loaded, submitted), {
    changes: { loanRate: "7.25", loanEscrow: "yes" },
    expected: { loanRate: "6.875", loanEscrow: "no" },
  });
});

test("changedFields: an untouched form sends nothing", () => {
  const loaded = { notes: "Roof done.\r\nGutters next.", sqft: 2300, value: null };
  assert.deepEqual(changedFields(loaded, { notes: "Roof done.\nGutters next.", sqft: "2300", value: "" }), { changes: {}, expected: {} });
});

test("staleFields: a field a partner changed meanwhile refuses the save", () => {
  // Connor opened Loan when the rate was 6.875; Pieter has since saved 7.0.
  const edits = changedFields({ loanRate: "6.875", lender: "Vontive" }, { loanRate: "7.25", lender: "Vontive" });
  assert.deepEqual(staleFields({ loanRate: { toString: () => "7" }, lender: "Conventus" }, edits), ["loanRate"]);
  // The lender wasn't touched, so Pieter's lender change doesn't block it, and isn't sent back.
  assert.deepEqual(Object.keys(edits.changes), ["loanRate"]);
});

test("staleFields: Notes are refused when the stored text moved", () => {
  const edits = changedFields({ notes: "Roof done." }, { notes: "Roof done.\nBoiler serviced." });
  assert.deepEqual(staleFields({ notes: "Roof done.\nTenant moving out in May." }, edits), ["notes"]);
  assert.deepEqual(staleFields({ notes: "Roof done." }, edits), []);
});

test("staleFields: no conflict when the stored value is already what's being written", () => {
  const edits = changedFields({ loanMaturityDate: null }, { loanMaturityDate: "2027-03-01" });
  assert.deepEqual(staleFields({ loanMaturityDate: new Date("2027-03-01T00:00:00.000Z") }, edits), []);
  assert.deepEqual(staleFields({ loanMaturityDate: null }, edits), []);
  assert.deepEqual(staleFields({ loanMaturityDate: new Date("2026-12-01T00:00:00.000Z") }, edits), ["loanMaturityDate"]);
});

test("isAtVersion: a refresh between Edit and Save refuses the save", () => {
  const atEdit = new Date("2026-10-23T14:00:00.000Z");
  const pinned = atEdit.toISOString();
  // A save in another card refreshes the page, so the row and the version prop move on together.
  const afterRefresh = new Date("2026-10-23T14:05:00.000Z");
  assert.equal(isAtVersion(atEdit, pinned), true);
  assert.equal(isAtVersion(afterRefresh, pinned), false);
  // Sending the refreshed prop instead of the pinned version would slip past the guard.
  assert.equal(isAtVersion(afterRefresh, afterRefresh.toISOString()), true);
  assert.equal(isAtVersion(atEdit, "not a date"), false);
});
