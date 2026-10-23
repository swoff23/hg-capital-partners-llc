import test from "node:test";
import assert from "node:assert/strict";
import { TaskChangedError, TaskRuleError } from "./core";

test("a stale change says who moved the task, in one line", () => {
  const err = new TaskChangedError("DONE", "Pieter");
  assert.equal(err.message, "Pieter moved this to Done.");
  assert.equal(err.current, "DONE");
  // The actions' error handling and userMessage() treat it as a rule error.
  assert.ok(err instanceof TaskRuleError);
  assert.equal(new TaskChangedError("IN_PROGRESS", "").message, "Someone moved this to In progress.");
  assert.equal(new TaskChangedError("REVIEW", null).message, "Someone moved this to Review.");
});
