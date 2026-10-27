import test from "node:test";
import assert from "node:assert/strict";
import { ConflictError, conflictKeepLabel, conflictValueLine, toFailure } from "@/lib/action-result";
import { asEditorConflict } from "./conflicts";
import { NotesChangedError, TaskRuleError } from "./core";

const AT = new Date("2026-10-27T18:14:00Z");
const NOW = new Date("2026-10-27T19:00:00Z");

test("a stale notes save reaches the notes field as its conflict: who, what and when, with Keep and Save mine", () => {
  const err = asEditorConflict(new NotesChangedError("Pieter", false, AT, "Pieter's newer notes"));
  assert.ok(err instanceof ConflictError);
  const failure = toFailure(err);
  assert.equal(failure.ok, false);
  assert.deepEqual(failure.conflict, { fields: ["description"], at: AT.toISOString(), by: "Pieter", theirs: { description: "Pieter's newer notes" } });
  assert.equal(conflictValueLine(failure.conflict!, "Pieter's newer notes", NOW), "Pieter set this to Pieter's newer notes at 2:14 PM");
  assert.equal(conflictKeepLabel(failure.conflict!), "Keep Pieter's");
});

test("notes from your own other tab name nobody, so your first name never reads as someone else", () => {
  const failure = toFailure(asEditorConflict(new NotesChangedError(null, true, AT, "From my other tab")));
  assert.equal(failure.conflict?.by, undefined);
  // "at 2:14 PM" today, "on Oct 27" on a later day: the clock the test runs on decides which.
  assert.match(failure.error, /^This changed (at|on) /);
  assert.equal(conflictKeepLabel(failure.conflict!), "Keep current");
});

test("any other error passes through as it was", () => {
  const rule = new TaskRuleError("That task no longer exists.");
  assert.equal(asEditorConflict(rule), rule);
  const plain = new Error("boom");
  assert.equal(asEditorConflict(plain), plain);
});
