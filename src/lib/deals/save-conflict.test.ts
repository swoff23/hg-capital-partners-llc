import test from "node:test";
import assert from "node:assert/strict";
import { ConflictError, toFailure, type ActionResult } from "@/lib/action-result";
import { stageConflictMessage, withStageConflictLine } from "./save-conflict";

const at = "2026-10-27T12:31:00.000Z"; // 8:31 AM in Buffalo
const now = new Date("2026-10-27T13:00:00.000Z");
const conflict = toFailure(new ConflictError({ fields: ["status"], by: "Connor Swofford", at, theirs: { status: "6 - Holding" } }));

test("a stage conflict says what the stage is now", () => {
  // It said only "Connor changed this at 8:31 AM.", which named no field and no stage.
  assert.equal(stageConflictMessage(conflict.conflict!, now), "Connor changed the stage to Holding at 8:31 AM.");
  assert.equal(stageConflictMessage({ at, theirs: { status: "CLOSED!" } }, now), "The stage changed to Closed at 8:31 AM.");
  assert.equal(stageConflictMessage({ at, by: "Connor" }, now), null, "no stage carried, nothing to say");

  const worded = withStageConflictLine(conflict, now);
  assert.equal(worded.ok, false);
  assert.equal(!worded.ok && worded.error, "Connor changed the stage to Holding at 8:31 AM.");
  assert.deepEqual(!worded.ok && worded.conflict, conflict.conflict);
  const plain: ActionResult = { ok: false, error: "No connection. Try again." };
  assert.equal(withStageConflictLine(plain, now), plain);
  const ok: ActionResult = { ok: true, data: undefined };
  assert.equal(withStageConflictLine(ok, now), ok);
});
