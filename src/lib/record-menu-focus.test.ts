import test from "node:test";
import assert from "node:assert/strict";
import { RECORD_MENU_ATTR, focusRecordMenu } from "./record-menu-focus";

test("Restore on the archived notice hands focus to the record's ⋯ button", () => {
  const focused: string[] = [];
  const button = { focus: () => focused.push("more actions") } as unknown as HTMLElement;
  const asked: string[] = [];
  const page = {
    querySelector: (selector: string) => {
      asked.push(selector);
      return button;
    },
  } as unknown as Pick<ParentNode, "querySelector">;
  assert.equal(focusRecordMenu(page), true);
  assert.deepEqual(focused, ["more actions"]);
  assert.deepEqual(asked, ["[data-record-menu]"]);
  assert.equal(RECORD_MENU_ATTR, "data-record-menu");
});

test("a page with no ⋯ button, or no page at all, has nothing to hand focus to", () => {
  const empty = { querySelector: () => null } as unknown as Pick<ParentNode, "querySelector">;
  assert.equal(focusRecordMenu(empty), false);
  assert.equal(focusRecordMenu(null), false);
});
