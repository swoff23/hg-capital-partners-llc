import test from "node:test";
import assert from "node:assert/strict";
import { pushView, removeView, sheetEscape, updateView, type SheetViewEntry } from "./sheet-views";

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
