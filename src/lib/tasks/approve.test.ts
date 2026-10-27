import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TaskChangedError, TaskRuleError } from "./core";
import { approved, approvedTick } from "./approve";

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

test("a tick on a Needs review row from an old tab is an approval: its Done toast, or nothing when the other partner was first", async () => {
  assert.deepEqual(await approvedTick(async () => ({ statusEventId: "ev9", emailsContractor: true, nextDue: "2026-11-05" as const })), { nextDue: "2026-11-05" });
  // Approved first by Pieter: no Done toast, so no Undo offering to take back his approval.
  assert.equal(
    await approvedTick(async () => {
      throw new TaskChangedError("DONE", "Pieter");
    }),
    null,
  );
  await assert.rejects(
    approvedTick(async () => {
      throw new TaskChangedError("IN_PROGRESS", "Connor");
    }),
    /moved this to In progress/,
  );
});

test("setTaskDone sends a tick on a row that showed Needs review through Approve, before the plain status move", () => {
  // The server action reads the session and the database, which node:test can't load, so this pins its source.
  const src = readFileSync(join(import.meta.dirname, "..", "..", "app", "(app)", "tasks", "list-actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function setTaskDone"), src.indexOf("export async function undoDone"));
  const guard = body.indexOf('if (want && shown === "REVIEW")');
  assert.ok(guard > 0, "the guard is there");
  assert.ok(guard < body.indexOf("try {"), "and comes before the plain move");
  assert.match(body.slice(guard), /^if \(want && shown === "REVIEW"\) \{\s*return approvedTick\(\(\) => tasks\.setTaskStatus\(taskId\.parse\(id\), "DONE", tasks\.staffPrincipal\(user\), \{ expected: "REVIEW" \}\)\);/);
});
