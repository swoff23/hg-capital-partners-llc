import test from "node:test";
import assert from "node:assert/strict";
import { inlineEditCommit } from "./inline-edit";

test("inlineEditCommit: focus and blur with no edit saves nothing, stray spaces and all", () => {
  const stored = "256 Auburn Avenue   Buffalo ,  NY   14213";
  assert.equal(inlineEditCommit(stored, stored), null);
  assert.equal(inlineEditCommit("Fix\tfront  steps\n", "Fix\tfront  steps\n", 2), null);
});

test("inlineEditCommit: a whitespace-only change saves nothing", () => {
  assert.equal(inlineEditCommit("256 Auburn Avenue Buffalo", "256 Auburn Avenue   Buffalo"), null);
  assert.equal(inlineEditCommit("  Fix front steps ", "Fix front steps"), null);
});

test("inlineEditCommit: a real edit saves, tidied to one line", () => {
  assert.equal(inlineEditCommit("Fix  front\nsteps at 767 ", "Fix front steps", 2), "Fix front steps at 767");
  assert.equal(inlineEditCommit("258 Auburn Avenue   Buffalo", "256 Auburn Avenue   Buffalo"), "258 Auburn Avenue Buffalo");
});

test("inlineEditCommit: too short or blank reverts", () => {
  assert.equal(inlineEditCommit("   ", "Fix front steps"), null);
  assert.equal(inlineEditCommit("A", "Fix front steps", 2), null);
  assert.equal(inlineEditCommit("Ab", "Fix front steps", 2), "Ab");
});
