import test from "node:test";
import assert from "node:assert/strict";
import { ConflictError } from "@/lib/action-result";
import { dealConflict, dealPatchData, guardedDealFields, staleDealFields } from "./edits";

const stored = {
  address: "767 Prospect Ave",
  status: "2 - Medium",
  priority: null,
  passReason: null,
  theirPriceRaw: "425k",
  ourPriceRaw: "380000",
  units: 4,
  nextAction: "Call listing agent",
  sourceUrl: null,
};

test("dealPatchData: prices keep the typed text and a parsed amount, an unknown stage is ignored", () => {
  assert.deepEqual(dealPatchData({ theirPriceRaw: "425k" }), { theirPriceRaw: "425k", theirPrice: "425000.00" });
  assert.deepEqual(dealPatchData({ ourPriceRaw: "low 400s" }), { ourPriceRaw: "low 400s", ourPrice: null });
  assert.deepEqual(dealPatchData({ ourPriceRaw: "" }), { ourPriceRaw: null, ourPrice: null });
  assert.deepEqual(dealPatchData({ status: "Nonsense" }), {});
  assert.deepEqual(dealPatchData({ status: "1 - High", units: 3, nextAction: "" }), { status: "1 - High", units: 3, nextAction: null });
  assert.deepEqual(dealPatchData({ address: "   " }), {});
});

test("staleDealFields: a price a partner changed meanwhile refuses the save", () => {
  // Connor opened the deal when the asking price read 425k; Pieter has since saved 410k.
  const now = { ...stored, theirPriceRaw: "410k" };
  assert.deepEqual(staleDealFields(now, { theirPriceRaw: "430k" }, { theirPriceRaw: "425k" }), ["theirPriceRaw"]);
});

test("staleDealFields: nothing is stale when the stored value is still what the editor loaded", () => {
  assert.deepEqual(staleDealFields(stored, { theirPriceRaw: "430k" }, { theirPriceRaw: "425k" }), []);
});

test("staleDealFields: no conflict when the stored value is already what's being written", () => {
  const now = { ...stored, nextAction: "Send offer" };
  assert.deepEqual(staleDealFields(now, { nextAction: "Send offer" }, { nextAction: "Call listing agent" }), []);
});

test("staleDealFields: units compare as text, so a number and its text agree", () => {
  assert.deepEqual(staleDealFields(stored, { units: 5 }, { units: "4" }), []);
  assert.deepEqual(staleDealFields({ ...stored, units: 6 }, { units: 5 }, { units: "4" }), ["units"]);
  // Cleared: the loaded text is "4", the write is blank.
  assert.deepEqual(staleDealFields({ ...stored, units: 6 }, { units: null }, { units: "4" }), ["units"]);
});

test("staleDealFields: a list pick sends no expected values and is never refused", () => {
  const now = { ...stored, status: "5 - TBD" };
  assert.deepEqual(staleDealFields(now, { status: "1 - High" }), []);
  assert.deepEqual(guardedDealFields({ status: "1 - High" }), []);
});

test("staleDealFields: only the fields in the patch count, and a field the editor didn't change is not sent back", () => {
  // Pieter changed the next action; Connor edits the price and never touched it.
  const now = { ...stored, nextAction: "Send offer" };
  assert.deepEqual(staleDealFields(now, { ourPriceRaw: "390000" }, { ourPriceRaw: "380000", nextAction: "Call listing agent" }), []);
  assert.deepEqual(guardedDealFields({ ourPriceRaw: "390000" }, { ourPriceRaw: "380000", nextAction: "Call listing agent" }), ["ourPriceRaw"]);
});

test("dealConflict: names the person and carries what the field holds now; without one it says what changed", () => {
  const at = new Date("2026-10-23T18:14:00.000Z");
  const withPerson = dealConflict({ ...stored, updatedAt: at, updatedByUser: { name: "Pieter Louw", email: "pieter@example.com" } }, ["theirPriceRaw"]);
  assert.ok(withPerson instanceof ConflictError);
  assert.deepEqual(withPerson.conflict, { fields: ["theirPriceRaw"], at: at.toISOString(), by: "Pieter Louw", theirs: { theirPriceRaw: "425k" } });
  const without = dealConflict({ ...stored, updatedAt: at, updatedByUser: null }, ["theirPriceRaw"]);
  assert.equal(without.conflict.by, undefined);
  assert.match(without.message, /^This changed /);
});
