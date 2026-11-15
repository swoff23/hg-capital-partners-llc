import test from "node:test";
import assert from "node:assert/strict";
import { ConflictError, conflictKeepLabel } from "@/lib/action-result";
import { switchSave } from "@/lib/inline-edit";
import { changedFields, editorName, fieldText, isAtVersion, onConflict, rowConflict, sameText, staleFields } from "./edits";

test("rowConflict: a field save names who saved last, when, and what the field holds now", () => {
  const at = new Date("2026-10-23T18:14:00.000Z");
  const row = { updatedAt: at, updatedByUser: { name: "Pieter Louw", email: "pieter@example.com" }, value: { toString: () => "410000" } };
  const err = rowConflict(row, ["value"], { values: true });
  assert.ok(err instanceof ConflictError);
  assert.deepEqual(err.conflict, { fields: ["value"], at: at.toISOString(), by: "Pieter Louw", theirs: { value: "410000" } });
  // The one line the toast and the form-level fallback use.
  assert.match(err.message, /^Pieter changed this /);
});

test("rowConflict: a row that doesn't record who says so without a name", () => {
  const at = new Date("2026-10-23T18:14:00.000Z");
  const err = rowConflict({ updatedAt: at, updatedByUser: null, loanRate: "7.25" }, ["loanRate"], { values: true });
  assert.deepEqual(err.conflict, { fields: ["loanRate"], at: at.toISOString(), theirs: { loanRate: "7.25" } });
  assert.match(err.message, /^This changed /);
  // A name-less user falls back to their email's name part in the line.
  const byEmail = rowConflict({ updatedAt: at, updatedByUser: { name: null, email: "pieter@example.com" } }, ["units"]);
  assert.equal(editorName({ name: null, email: "pieter@example.com" }), "pieter@example.com");
  assert.equal(byEmail.conflict.by, "pieter@example.com");
  assert.match(byEmail.message, /^Pieter changed this /);
});

test("rowConflict: your own newer save says You and names no one (design call 19)", () => {
  const at = new Date("2026-10-23T18:14:00.000Z");
  const row = { updatedAt: at, updatedByUserId: "u_connor", updatedByUser: { name: "Connor Swofford", email: "connor@example.com" }, value: "410000" };
  // It read "Connor changed this at 2:14 PM." and "Keep Connor's", to Connor.
  const yours = rowConflict(row, ["value"], { values: true, actorId: "u_connor" });
  assert.deepEqual(yours.conflict, { fields: ["value"], at: at.toISOString(), mine: true, theirs: { value: "410000" } });
  assert.match(yours.message, /^You changed this /);
  assert.equal(conflictKeepLabel(yours.conflict), "Keep current");
  // A whole-blob editor (units, building CapEx, listings) the same way.
  assert.match(rowConflict(row, ["units"], { actorId: "u_connor" }).message, /^You changed this /);
  // Someone else's save, an unknown caller, and a row with no last editor are as they were.
  assert.equal(rowConflict(row, ["value"], { actorId: "u_pieter" }).conflict.by, "Connor Swofford");
  assert.equal(rowConflict(row, ["value"], {}).conflict.by, "Connor Swofford");
  assert.equal(rowConflict({ updatedAt: at, updatedByUserId: null, updatedByUser: null }, ["value"], { actorId: "u_connor" }).conflict.mine, undefined);
});

test("every property save hands its conflict the person saving, and reads the row's last editor id to compare (design call 19)", async () => {
  // service.ts talks to the database, so its source is read.
  const { readFileSync } = await import("node:fs");
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  // No conflict is built without the actor: each rowConflict passes actorId, each conflictOf passes `by`.
  const built = service.match(/throw rowConflict\([^\n]*\);/g) ?? [];
  assert.equal(built.length, 3);
  for (const call of built) assert.match(call, /actorId: by\?\.id \}\);$/, call);
  const read = service.match(/throw await conflictOf\([^\n]*\);/g) ?? [];
  assert.equal(read.length, 4);
  for (const call of read) assert.match(call, /^throw await conflictOf\([a-zA-Z]+, \[[^\]]*\]|^throw await conflictOf\([a-zA-Z]+, guarded/, call);
  for (const call of read) assert.match(call, /, by(, \{[^}]*\})?\);$/, call);
  assert.match(service, /return rowConflict\(row, fields, \{ values: opts\.values, actorId: by\?\.id \}\);/);
  // The two saves that select columns by name read the last editor's id too, or the comparison would never match.
  assert.match(service, /select: \{ units: true, unitCount: true, updatedAt: true, updatedByUserId: true,/);
  assert.match(service, /select: \{ buildingCapex: true, updatedAt: true, updatedByUserId: true,/);
});

test("rowConflict: a whole-blob editor names the blob and carries no values", () => {
  const at = new Date("2026-10-23T18:14:00.000Z");
  const err = rowConflict({ updatedAt: at, updatedByUser: { name: "Pieter Louw", email: "p@x.com" } }, ["units"]);
  assert.deepEqual(err.conflict, { fields: ["units"], at: at.toISOString(), by: "Pieter Louw" });
});

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

/**
 * Three quick taps on the Escrow switch, run against patchProperty's rule
 * (staleFields) one at a time, as Next sends server actions. `shown` is what
 * the switch shows after each tap; `rendered` is the page's value, which
 * doesn't move until the saves come back.
 */
function tapEscrow(expectedOf: (shown: string, rendered: string) => string): string[] {
  let stored = false;
  const rendered = "no";
  let shown = rendered;
  const conflicts: string[] = [];
  for (const selected of [true, false, true]) {
    const { next } = switchSave(shown, selected);
    const expected = expectedOf(shown, rendered);
    shown = next;
    const stale = staleFields({ loanEscrow: stored }, { changes: { loanEscrow: next }, expected: { loanEscrow: expected } });
    if (stale.length > 0) conflicts.push(`tap to ${next}`);
    else stored = next === "yes";
  }
  return conflicts;
}

test("switchSave: quick taps queue and the last wins, instead of refusing each other", () => {
  // The switch's own value as expected: no conflict, and Escrow ends at Yes.
  assert.deepEqual(tapEscrow((shown) => switchSave(shown, true).expected), []);
  // What it used to send, the page's value: the second and third taps read as "Connor set this to Yes".
  assert.deepEqual(tapEscrow((_shown, rendered) => rendered), ["tap to no"]);
  assert.deepEqual(switchSave("yes", false), { next: "no", expected: "yes" });
});

test("onConflict: a refused save runs `then` (the page's revalidate) and still refuses", async () => {
  let refreshed = 0;
  const refusal = rowConflict({ updatedAt: new Date("2026-10-27T12:39:00.000Z"), updatedByUser: null }, ["units"]);
  await assert.rejects(
    onConflict(async () => {
      throw refusal;
    }, () => refreshed++),
    (err) => err === refusal,
  );
  assert.equal(refreshed, 1);
  // Any other failure, and a save that lands, leave the page alone.
  await assert.rejects(onConflict(async () => Promise.reject(new Error("This property is gone.")), () => refreshed++));
  assert.equal(await onConflict(async () => "saved", () => refreshed++), "saved");
  assert.equal(refreshed, 1);
});
