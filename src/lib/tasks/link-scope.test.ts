import test from "node:test";
import assert from "node:assert/strict";
import { TaskRuleError, assertContractorAccess, type Tx } from "./core";

// A session an email's job link started reaches its own job only (docs/specs/contractor-job-emails.md, section 3).
test("a link session is refused any other job before the access row is even read", async () => {
  let read = 0;
  const tx = {
    taskAccess: {
      findUnique: async () => {
        read++;
        return { revokedAt: null, contact: { active: true, portalAccount: { status: "ACTIVE" } } };
      },
    },
  } as unknown as Tx;
  await assert.rejects(assertContractorAccess(tx, "t2", { contactId: "c1", onlyTaskId: "t1" }), TaskRuleError);
  assert.equal(read, 0);
  // Its own job, and any job for a session from signing in, go on to the access row as before.
  await assertContractorAccess(tx, "t1", { contactId: "c1", onlyTaskId: "t1" });
  await assertContractorAccess(tx, "t2", { contactId: "c1", onlyTaskId: null });
  await assertContractorAccess(tx, "t2", { contactId: "c1" });
  assert.equal(read, 3);
});
