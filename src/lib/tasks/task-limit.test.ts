import test from "node:test";
import assert from "node:assert/strict";
import { TASK_PAGE, TASK_PAGE_MAX, taskLimit } from "./list-query";

test("taskLimit: the first page unless the URL asks for more", () => {
  assert.equal(taskLimit({}), TASK_PAGE);
  assert.equal(taskLimit({ show: "100" }), 100);
  assert.equal(taskLimit({ show: "200" }), 200);
  assert.equal(taskLimit({ show: "400" }), TASK_PAGE_MAX);
});

test("taskLimit: whole pages, never past the most", () => {
  assert.equal(taskLimit({ show: "150" }), 200, "rounds up to a whole page");
  assert.equal(taskLimit({ show: "1" }), 100);
  assert.equal(taskLimit({ show: "401" }), TASK_PAGE_MAX);
  assert.equal(taskLimit({ show: "100000" }), TASK_PAGE_MAX);
});

test("taskLimit: anything that isn't a number is the first page", () => {
  assert.equal(taskLimit({ show: "" }), TASK_PAGE);
  assert.equal(taskLimit({ show: "all" }), TASK_PAGE);
  assert.equal(taskLimit({ show: "-300" }), TASK_PAGE);
  assert.equal(taskLimit({ show: "0" }), TASK_PAGE);
  assert.equal(taskLimit({ show: ["200", "300"] }), TASK_PAGE, "a repeated param is read as none");
  assert.equal(taskLimit({ show: undefined }), TASK_PAGE);
});
