import test from "node:test";
import assert from "node:assert/strict";
import { ConflictError, toFailure, type ActionResult } from "@/lib/action-result";
import { DEAL_STATUSES } from "@/lib/config";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import { stageConflictMessage, withStageConflictLine } from "./save-conflict";

const at = "2026-10-27T12:31:00.000Z"; // 8:31 AM in Buffalo
const now = new Date("2026-10-27T13:00:00.000Z");
const conflict = toFailure(new ConflictError({ fields: ["status"], by: "Connor Swofford", at, theirs: { status: "6 - Holding" } }));

test("a stage conflict says what the stage is now", () => {
  // It said only "Connor changed this at 8:31 AM.", which named no field and no stage.
  assert.equal(stageConflictMessage(conflict.conflict!, now), "Connor set Holding at 8:31 AM.");
  assert.equal(stageConflictMessage({ at, theirs: { status: "CLOSED!" } }, now), "Set to Closed at 8:31 AM.");
  assert.equal(stageConflictMessage({ at, by: "Connor" }, now), null, "no stage carried, nothing to say");

  const worded = withStageConflictLine(conflict, now);
  assert.equal(worded.ok, false);
  assert.equal(!worded.ok && worded.error, "Connor set Holding at 8:31 AM.");
  assert.deepEqual(!worded.ok && worded.conflict, conflict.conflict);
  const plain: ActionResult = { ok: false, error: "No connection. Try again." };
  assert.equal(withStageConflictLine(plain, now), plain);
  const ok: ActionResult = { ok: true, data: undefined };
  assert.equal(withStageConflictLine(ok, now), ok);
});

test("a stage conflict from an earlier day says the day, and one with no readable time says none", () => {
  assert.equal(stageConflictMessage({ by: "Pieter Louw", at: "2026-10-24T15:00:00.000Z", theirs: { status: "6 - Holding" } }, now), "Pieter set Holding on Oct 24.");
  assert.equal(stageConflictMessage({ by: "Pieter Louw", at: "not a date", theirs: { status: "Pass" } }, now), "Pieter set Pass.");
});

test("the toast shows whole on a phone: when the time won't fit, the stage and who set it stay", () => {
  // The toast is one truncated line, about 30 characters at 320. 'The stage changed to Holding at 11:04 AM.'
  // (41) lost its time at 375, and with a name it would have cut at the stage.
  const times = [
    "2026-10-27T12:31:00.000Z", // 8:31 AM today
    "2026-10-27T16:59:00.000Z", // 12:59 PM today
    "2026-10-24T15:00:00.000Z", // Oct 24
    "2025-12-24T15:00:00.000Z", // Dec 24, 2025
  ];
  const names = [undefined, "Zack", "Pieter Louw", "Connor Swofford", "Christopher Anderson"];
  const lines = new Set<string>();
  for (const status of DEAL_STATUSES) {
    for (const when of times) {
      for (const by of names) {
        const line = stageConflictMessage({ by, at: when, theirs: { status } }, now);
        assert.ok(line, `${status} ${when} ${by}`);
        lines.add(line);
        assert.ok(line.length <= TOAST_PHONE_CHARS, `"${line}" (${line.length}) is more than ${TOAST_PHONE_CHARS} characters`);
        assert.ok(!line.includes("—") && line.endsWith("."), line);
      }
    }
  }
  // The longest stage label, the longest time and a long name: the time goes, the rest stays.
  assert.equal(stageConflictMessage({ by: "Pieter Louw", at: "2025-12-24T15:00:00.000Z", theirs: { status: "4 - To Schedule" } }, now), "Pieter set To schedule.");
  assert.equal(stageConflictMessage({ at: "2025-12-24T15:00:00.000Z", theirs: { status: "4 - To Schedule" } }, now), "Set to To schedule.");
  assert.ok(lines.size > 20);
});
