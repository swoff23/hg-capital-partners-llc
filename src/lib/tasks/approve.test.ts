import test from "node:test";
import assert from "node:assert/strict";
import { TaskChangedError, TaskRuleError } from "./core";
import { approved } from "./approve";

test("Approve answers with the Done line it wrote, for the toast's Undo", async () => {
  assert.deepEqual(await approved(async () => ({ statusEventId: "ev9", emailsContractor: true })), { approvedEventId: "ev9", emailsContractor: true });
});

test("a job the other partner already approved is a quiet success with nothing to undo", async () => {
  const out = await approved(async () => {
    throw new TaskChangedError("DONE", "Pieter");
  });
  assert.deepEqual(out, { approvedEventId: null, emailsContractor: false });
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
