import test from "node:test";
import assert from "node:assert/strict";
import { NEW_TASK_PATH, afterCreate, isStillOnNewTask, newTaskDraftKey } from "./new-task";

test("newTaskDraftKey: a draft belongs to the person who typed it", () => {
  const property = { kind: "property", id: "p_1" };
  assert.equal(newTaskDraftKey("u-connor", property), "new-task:u-connor:property:p_1");
  assert.equal(newTaskDraftKey("u-pieter", property), "new-task:u-pieter:property:p_1");
  assert.notEqual(newTaskDraftKey("u-connor", property), newTaskDraftKey("u-pieter", property));
  assert.notEqual(newTaskDraftKey("u-connor", null), newTaskDraftKey("u-pieter", null));
});

test("newTaskDraftKey: still one draft per thing the task is about", () => {
  assert.equal(newTaskDraftKey("u-connor", null), "new-task:u-connor:none");
  assert.notEqual(newTaskDraftKey("u-connor", { kind: "property", id: "x" }), newTaskDraftKey("u-connor", { kind: "deal", id: "x" }));
  assert.notEqual(newTaskDraftKey("u-connor", { kind: "deal", id: "d_1" }), newTaskDraftKey("u-connor", { kind: "deal", id: "d_2" }));
});

test("afterCreate: the sheet goes back, the page lands on the task, Create more stays", () => {
  assert.equal(afterCreate("sheet", false, true), "back");
  assert.equal(afterCreate("page", false, true), "replace");
  assert.equal(afterCreate("sheet", true, true), "stay");
  assert.equal(afterCreate("page", true, true), "stay");
});

test("afterCreate: someone who already left isn't navigated again", () => {
  // Back or an iOS swipe while Create was in flight: the sheet is gone and the browser is already one page back.
  assert.equal(afterCreate("sheet", false, false), "stay");
  assert.equal(afterCreate("page", false, false), "stay");
});

test("isStillOnNewTask: mounted, and the path is still New task's own", () => {
  assert.equal(isStillOnNewTask(true, NEW_TASK_PATH), true);
  assert.equal(isStillOnNewTask(false, NEW_TASK_PATH), false);
  assert.equal(isStillOnNewTask(true, "/tasks"), false);
  assert.equal(isStillOnNewTask(true, "/properties/p_1"), false);
});
