import test from "node:test";
import assert from "node:assert/strict";
import { escapePlan, pushView, removeView, sheetEscape, updateView, type SheetViewEntry } from "./sheet-views";

const view = (id: string, escape: SheetViewEntry["escape"] = "back"): SheetViewEntry => ({
  id,
  title: id,
  escape,
  hasFooter: false,
});

test("pushView: the newest view is on top; pushing one twice keeps one", () => {
  let stack = pushView([], view("assignee"));
  stack = pushView(stack, view("repeat"));
  stack = pushView(stack, view("assignee"));
  assert.deepEqual(
    stack.map((v) => v.id),
    ["assignee", "repeat"],
  );
});

test("removeView and updateView: by id, the rest untouched", () => {
  const stack = [view("due"), view("repeat"), view("custom", "close")];
  assert.deepEqual(
    removeView(stack, "repeat").map((v) => v.id),
    ["due", "custom"],
  );
  const renamed = updateView(stack, "custom", { title: "Every 2 weeks", hasFooter: true });
  assert.equal(renamed[2].title, "Every 2 weeks");
  assert.equal(renamed[2].hasFooter, true);
  assert.equal(renamed[0], stack[0]);
});

test("sheetEscape: a back view goes back; a step or the sheet's own body closes, asking first when dirty", () => {
  assert.equal(sheetEscape(view("assignee", "back"), true), "back");
  assert.equal(sheetEscape(view("waiting", "close"), false), "close");
  assert.equal(sheetEscape(view("waiting", "close"), true), "ask");
  assert.equal(sheetEscape(undefined, false), "close");
  assert.equal(sheetEscape(undefined, true), "ask");
});

test("escapePlan: a picker over a form goes back one view", () => {
  assert.deepEqual(escapePlan([view("assignee", "back")], false), { kind: "pop", count: 1 });
  assert.deepEqual(escapePlan([view("due", "back"), view("repeat", "back")], true), { kind: "pop", count: 1 });
});

test("escapePlan: a step over a picker closes the picker too, and the form shows again", () => {
  // Due date inside New task: the picker's view, then its calendar step.
  assert.deepEqual(escapePlan([view("due", "back"), view("calendar", "close")], true), { kind: "pop", count: 2 });
  // Repeat inside Due inside the form: the picker, the repeat view, Custom.
  assert.deepEqual(escapePlan([view("due", "back"), view("repeat", "close"), view("custom", "close")], false), { kind: "pop", count: 3 });
});

test("escapePlan: a step with no picker under it is the sheet's own layer, so the sheet closes (asking first when dirty)", () => {
  assert.deepEqual(escapePlan([view("waiting", "close")], false), { kind: "close" });
  assert.deepEqual(escapePlan([view("waiting", "close")], true), { kind: "ask" });
  assert.deepEqual(escapePlan([], false), { kind: "close" });
  assert.deepEqual(escapePlan([], true), { kind: "ask" });
});
