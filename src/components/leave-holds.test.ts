import test from "node:test";
import assert from "node:assert/strict";
import { hasUnsavedWork, holdApplies, holdFor, setHold, type HoldEntry } from "./leave-holds";

const form = { title: "Leave without saving Unit 2?", stay: "Keep editing", scope: "all" as const };
const uploads = { title: "2 photos are still uploading", stay: "Keep uploading", scope: "sign-out" as const };

test("an in-app link asks only for holds on every exit; Sign out asks for both", () => {
  assert.equal(holdApplies({ scope: "all" }, false), true);
  assert.equal(holdApplies({ scope: "sign-out" }, false), false);
  assert.equal(holdApplies({ scope: "all" }, true), true);
  assert.equal(holdApplies({ scope: "sign-out" }, true), true);
});

test("uploads alone never stop a back link, only Sign out", () => {
  const holds = setHold([], "up", uploads);
  assert.equal(holdFor(holds, false), null);
  assert.equal(holdFor(holds, true)?.title, "2 photos are still uploading");
});

test("with a dirty form and uploads, a link asks about the form and Sign out about whichever came last", () => {
  let holds: HoldEntry[] = setHold([], "form", form);
  holds = setHold(holds, "up", uploads);
  assert.equal(holdFor(holds, false)?.id, "form");
  assert.equal(holdFor(holds, true)?.id, "up");
  // The other way round, the form is the latest.
  const reversed = setHold(setHold([], "up", uploads), "form", form);
  assert.equal(holdFor(reversed, true)?.id, "form");
});

test("lifting a hold leaves the others; nothing held means leave at once", () => {
  let holds = setHold(setHold([], "form", form), "up", uploads);
  holds = setHold(holds, "form", null);
  assert.deepEqual(
    holds.map((h) => h.id),
    ["up"],
  );
  assert.equal(holdFor(holds, false), null);
  holds = setHold(holds, "up", null);
  assert.deepEqual(holds, []);
  assert.equal(holdFor(holds, true), null);
});

test("unsaved work is a hold on every exit; uploads in flight are not a draft", () => {
  assert.equal(hasUnsavedWork([]), false);
  assert.equal(hasUnsavedWork(setHold([], "up", uploads)), false);
  assert.equal(hasUnsavedWork(setHold([], "form", form)), true);
  assert.equal(hasUnsavedWork(setHold(setHold([], "up", uploads), "form", form)), true);
  // Saved, or discarded: the hold lifts and the page can refresh again.
  assert.equal(hasUnsavedWork(setHold(setHold([], "form", form), "form", null)), false);
});

test("new words keep a hold's place; the same words change nothing", () => {
  const holds = setHold(setHold([], "a", form), "b", { ...form, title: "Leave with 3 unsaved changes?" });
  const reworded = setHold(holds, "a", { ...form, title: "Leave without saving Unit 3?" });
  assert.deepEqual(
    reworded.map((h) => h.id),
    ["a", "b"],
  );
  assert.equal(reworded[0].title, "Leave without saving Unit 3?");
  assert.equal(holdFor(reworded, false)?.id, "b");
  assert.equal(setHold(holds, "a", form), holds);
  assert.equal(setHold(holds, "missing", null), holds);
});
