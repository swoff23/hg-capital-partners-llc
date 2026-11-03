import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConflictError, conflictKeepLabel, toFailure } from "@/lib/action-result";
import { inlineConflictLine } from "@/lib/inline-edit";
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
  // The notes field's line names who and when; Keep Pieter's shows the words, which would cut the line off.
  assert.match(inlineConflictLine("multiline", failure.conflict!, "Pieter's newer notes", NOW), /^Pieter changed this at 2:14\sPM$/);
  assert.equal(conflictKeepLabel(failure.conflict!), "Keep Pieter's");
});

test("notes from your own other tab name nobody, so your first name never reads as someone else", () => {
  const failure = toFailure(asEditorConflict(new NotesChangedError(null, true, AT, "From my other tab")));
  assert.equal(failure.conflict?.by, undefined);
  // "at 2:14 PM" today, "on Oct 27" on a later day: the clock the test runs on decides which.
  assert.match(failure.error, /^This changed (at|on) /);
  assert.equal(conflictKeepLabel(failure.conflict!), "Keep current");
});

test("a Restore from View previous carries the notes the page loaded, so it can't write over newer ones", () => {
  // The sheet's write is in a client component, so its source is read here; the refusal itself is core's (core.test.ts).
  const page = join(import.meta.dirname, "..", "..", "app", "(app)", "tasks", "[id]");
  const activity = readFileSync(join(page, "activity.tsx"), "utf8");
  const restore = activity.slice(activity.indexOf("async function restore()"), activity.indexOf("return (", activity.indexOf("async function restore()")));
  assert.match(restore, /updateTask\(taskId, \{ description: viewing\.text \|\| null, expectedDescription: notes \}\)/);
  // Refused, the page loads the newer notes, so a second Restore is a choice made over them.
  assert.match(restore, /if \(res\.conflict\) router\.refresh\(\);/);
  assert.match(activity, /<PreviousNotes taskId=\{taskId\} notes=\{notes\}/);
  assert.match(readFileSync(join(page, "view.tsx"), "utf8"), /<TaskActivity taskId=\{task\.id\} notes=\{task\.description\}/);
});

test("any other error passes through as it was", () => {
  const rule = new TaskRuleError("That task no longer exists.");
  assert.equal(asEditorConflict(rule), rule);
  const plain = new Error("boom");
  assert.equal(asEditorConflict(plain), plain);
});
