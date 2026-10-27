import test from "node:test";
import assert from "node:assert/strict";
import { TaskChangedError, TaskRuleError } from "./core";
import { approved } from "./approve";

test("Approve answers with the Done line it wrote, for the toast's Undo, and the next repeat's due date", async () => {
  assert.deepEqual(await approved(async () => ({ statusEventId: "ev9", emailsContractor: true, nextDue: null })), {
    approvedEventId: "ev9",
    emailsContractor: true,
    nextDue: null,
  });
  // A tick on a Needs review row is an approval too, and its toast says when the next copy is due.
  assert.equal((await approved(async () => ({ statusEventId: "ev9", emailsContractor: false, nextDue: "2026-11-05" as const }))).nextDue, "2026-11-05");
});

test("a job the other partner already approved is a quiet success with nothing to undo", async () => {
  const out = await approved(async () => {
    throw new TaskChangedError("DONE", "Pieter");
  });
  assert.deepEqual(out, { approvedEventId: null, emailsContractor: false, nextDue: null });
});

test("a job that moved anywhere else, or any other refusal, is passed on", async () => {
  await assert.rejects(
    approved(async () => {
      throw new TaskChangedError("IN_PROGRESS", "Connor");
    }),
    /moved this to In progress/,
  );
  await assert.rejects(
    approved(async () => {
      throw new TaskRuleError("That task no longer exists.");
    }),
    /no longer exists/,
  );
});
