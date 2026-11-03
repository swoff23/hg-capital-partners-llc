import { test } from "node:test";
import assert from "node:assert/strict";
import { isActionRequest } from "./action-request";

test("the render after a Server Action is told apart from an open", () => {
  // A tick or an edit: the action's POST, whose page re-render must not write Recent or the read state again.
  assert.equal(isActionRequest(new Headers({ "next-action": "7f3a9c", rsc: "1" })), true);
  // Opening the page, a client navigation, and router.refresh() all note an open.
  assert.equal(isActionRequest(new Headers()), false);
  assert.equal(isActionRequest(new Headers({ rsc: "1", "next-router-state-tree": "%5B%5D" })), false);
});
