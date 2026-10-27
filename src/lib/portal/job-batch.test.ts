import test from "node:test";
import assert from "node:assert/strict";
import { JOB_CLOSED } from "@/lib/attachments/access";
import { addComment, type Tx } from "@/lib/tasks/core";
import { postBatchIn } from "./job-batch";

/**
 * The contractor's batch step by the job's status (uploads 2.7 and question
 * 4), on a fake transaction: an active job (In progress, Review) gets the
 * undoable batch post, a job HG approved or canceled gets the late line that
 * tells HG once, and an approve that lands between the step's status read and
 * addComment's own goes the late way in the same transaction. The database
 * runs of the races are job-batch.pg.test.ts (opt-in) and the chunk 6
 * harness.
 */

const ZACK = { kind: "contractor", contactId: "c-zack", label: "Zack Outlaw" } as const;

interface Call {
  model: string;
  op: string;
  args: CallArgs;
}
type CallArgs = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };

/**
 * A transaction that answers what the batch step and core ask. `statuses` are the task's status at each read of
 * it, the last one repeating (an approve between reads is ["IN_PROGRESS", "DONE"]); null is a task that is gone.
 */
function fakeTx(opts: { statuses?: (string | null)[]; unposted?: string[] | null; posted?: number; access?: boolean } = {}) {
  const calls: Call[] = [];
  const statuses = [...(opts.statuses ?? ["IN_PROGRESS"])];
  let reads = 0;
  const result = (model: string, op: string, args: CallArgs) => {
    if (model === "taskAccess" && op === "findUnique") {
      return opts.access === false ? null : { revokedAt: null, contact: { active: true, portalAccount: { status: "ACTIVE" } } };
    }
    if (model === "task" && op === "findUnique") {
      const status = statuses[Math.min(reads++, statuses.length - 1)];
      return status === null ? null : { id: "t1", title: "Tile the bath", status, assigneeContactId: "c-zack" };
    }
    if (model === "taskAttachment" && op === "findMany") {
      const ids = ((args.where?.id as { in: string[] } | undefined)?.in ?? []) as string[];
      return (opts.unposted === undefined ? ids : (opts.unposted ?? [])).map((id) => ({ id, kind: "IMAGE" }));
    }
    if (model === "taskAttachment" && op === "count") return opts.posted ?? 0;
    if (model === "taskAttachment" && op === "updateMany") {
      const ids = ((args.where?.id as { in: string[] } | undefined)?.in ?? []) as string[];
      return { count: ids.length };
    }
    if (model === "taskEvent" && op === "create") return { id: `e-${calls.length}`, ...args.data };
    if (model === "user" && op === "findMany") return [{ id: "u-connor" }, { id: "u-pieter" }];
    if (model === "portalAccount" && op === "findUnique") return { status: "ACTIVE" };
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany" || op === "deleteMany") return { count: 1 };
    return { id: `${model}-${calls.length}`, ...(args.data ?? {}) };
  };
  const raw = (kind: "$executeRaw" | "$queryRaw") => async (sql: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ model: kind, op: sql.join("?"), args: { data: { values } } });
    return kind === "$executeRaw" ? 1 : [];
  };
  const tx = new Proxy(
    {},
    {
      get(_, model: string) {
        if (model === "then") return undefined;
        if (model === "$executeRaw" || model === "$queryRaw") return raw(model);
        return new Proxy(
          {},
          {
            get(__, op: string) {
              return async (args: CallArgs = {}) => {
                calls.push({ model, op, args });
                return result(model, op, args);
              };
            },
          },
        );
      },
    },
  ) as unknown as Tx;
  return { tx, calls };
}

const isWrite = (c: Call) => /^(create|update|upsert|delete)/.test(c.op) || c.model === "$executeRaw";
const events = (calls: Call[]) => calls.filter((c) => c.model === "taskEvent" && c.op === "create").map((c) => c.args.data!);
const outboxInserts = (calls: Call[]) => calls.filter((c) => c.model === "$executeRaw" && c.op.includes('INSERT INTO "NotificationOutbox"'));

for (const status of ["IN_PROGRESS", "REVIEW"] as const) {
  test(`postBatchIn on a job ${status === "REVIEW" ? "in Review" : "in progress"}: one undoable batch post, its event back for the Undo`, async () => {
    const { tx, calls } = fakeTx({ statuses: [status] });
    const { event, linked } = await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a3"]);
    assert.ok(event, "an event, for the Undo");
    const made = events(calls);
    assert.equal(made.length, 1, "one line for the batch");
    assert.deepEqual(made[0].data, { batch: true }, "marked as the batch Undo can take back");
    assert.equal(made[0].body, null);
    assert.deepEqual(event.data, { batch: true }, "the event it hands back is that update");
    assert.deepEqual(linked, ["a1", "a2", "a3"], "the files it told HG of, for the toast's count");
    assert.equal(outboxInserts(calls).length, 2, "one email line per partner");
    // The access check is the first thing it does.
    assert.equal(calls[0].model, "taskAccess");
  });
}

for (const status of ["DONE", "CANCELED"] as const) {
  test(`postBatchIn on a job HG ${status === "DONE" ? "approved" : "canceled"}: the late line tells HG once, and nothing to undo`, async () => {
    const { tx, calls } = fakeTx({ statuses: [status] });
    const answer = await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a3"]);
    assert.deepEqual(answer, { event: null, linked: ["a1", "a2", "a3"] }, "no event id: the page says the photos were added to the job");
    const made = events(calls);
    assert.equal(made.length, 1, "one line for the batch");
    assert.deepEqual(made[0].data, { late: true }, "never a batch Undo takes back");
    const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!.args;
    assert.deepEqual(link.where, { id: { in: ["a1", "a2", "a3"] }, taskId: "t1", eventId: null, deletedAt: null, uploadedByContactId: "c-zack", asanaGid: null });
    assert.equal(outboxInserts(calls).length, 2, "HG hears: one email line per partner");
    // The job keeps its status.
    assert.ok(!made.some((e) => e.kind === "STATUS"));
    assert.ok(!calls.some((c) => c.model === "task" && c.op === "update" && "status" in (c.args.data ?? {})));
  });
}

test("postBatchIn: HG approves between the status read and addComment's, and the batch goes the late way in the same transaction", async () => {
  const { tx, calls } = fakeTx({ statuses: ["IN_PROGRESS", "DONE"] });
  const answer = await postBatchIn(tx, "t1", ZACK, ["a1", "a2"]);
  assert.deepEqual(answer, { event: null, linked: ["a1", "a2"] });
  // addComment read the job closed and refused before writing anything: the only writes are the late line's.
  const reads = calls.filter((c) => c.model === "task" && c.op === "findUnique");
  assert.ok(reads.length >= 2, "the step's read, then addComment's");
  const firstWrite = calls.findIndex(isWrite);
  const secondRead = calls.indexOf(reads[1]);
  assert.ok(firstWrite > secondRead, "nothing written before addComment's refusal");
  const made = events(calls);
  assert.equal(made.length, 1, "one line, the late one, and no empty batch update");
  assert.deepEqual(made[0].data, { late: true });
  assert.equal(outboxInserts(calls).length, 2);
});

test("addComment refuses a closed job with exactly the words the batch step falls back on, before any write", async () => {
  for (const status of ["DONE", "CANCELED"]) {
    const { tx, calls } = fakeTx({ statuses: [status] });
    await assert.rejects(addComment(tx, "t1", { body: "", attachmentIds: ["a1"], batch: true }, ZACK), (err: Error) => err.message === JOB_CLOSED);
    assert.deepEqual(calls.filter(isWrite), [], status);
  }
});

test("postBatchIn: no access is refused before the job is read, and nothing is written", async () => {
  const { tx, calls } = fakeTx({ access: false, statuses: ["DONE"] });
  await assert.rejects(postBatchIn(tx, "t1", ZACK, ["a1"]), /You don't have access to this job\./);
  assert.deepEqual(calls.map((c) => c.model), ["taskAccess"]);
});

test("postBatchIn: a job that no longer exists is refused, and nothing is written", async () => {
  const { tx, calls } = fakeTx({ statuses: [null] });
  await assert.rejects(postBatchIn(tx, "t1", ZACK, ["a1"]), /That task no longer exists\./);
  assert.deepEqual(calls.filter(isWrite), []);
});

test("postBatchIn: a late send whose files are all posted already answers quietly, with nothing written", async () => {
  // Sent again after its answer was lost: every id is this contractor's own posted file on the job.
  const { tx, calls } = fakeTx({ statuses: ["DONE"], unposted: [], posted: 2 });
  assert.deepEqual(await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a2"]), { event: null, linked: [] }, "nothing new was told, so nothing is counted");
  assert.deepEqual(calls.filter(isWrite), []);
  const count = calls.find((c) => c.model === "taskAttachment" && c.op === "count")!.args;
  assert.deepEqual(count.where, { id: { in: ["a1", "a2"] }, taskId: "t1", uploadedByContactId: "c-zack", eventId: { not: null }, deletedAt: null, asanaGid: null });
});

test("postBatchIn: a late send naming anything else posted or not this contractor's is still refused", async () => {
  const some = fakeTx({ statuses: ["DONE"], unposted: [], posted: 1 });
  await assert.rejects(postBatchIn(some.tx, "t1", ZACK, ["a1", "b9"]), /Write something or add a photo\./);
  assert.equal(outboxInserts(some.calls).length, 0);
  // On an active job a send of files already posted is refused as before, so its update rolls back.
  const active = fakeTx({ statuses: ["IN_PROGRESS"], unposted: [], posted: 2 });
  await assert.rejects(postBatchIn(active.tx, "t1", ZACK, ["a1", "a2"]), /Write something or add a photo\./);
  assert.deepEqual(active.calls.filter(isWrite), []);
});

test("postBatchIn: only the contractor's own unposted files are handed on", async () => {
  const { tx, calls } = fakeTx({ statuses: ["DONE"], unposted: ["a1"] });
  await postBatchIn(tx, "t1", ZACK, ["a1", "someone-elses"]);
  const own = calls.find((c) => c.model === "taskAttachment" && c.op === "findMany")!.args;
  assert.deepEqual(own.where, { id: { in: ["a1", "someone-elses"] }, taskId: "t1", uploadedByContactId: "c-zack", eventId: null, deletedAt: null, asanaGid: null });
  const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!.args;
  assert.deepEqual((link.where?.id as { in: string[] }).in, ["a1"]);
});

for (const status of ["IN_PROGRESS", "DONE"] as const) {
  test(`postBatchIn on a job ${status === "DONE" ? "approved" : "in progress"}: a file posted already isn't among the files it told HG of`, async () => {
    // a1 went out with an earlier post whose answer was lost, and came again with a later batch.
    const { tx, calls } = fakeTx({ statuses: [status], unposted: ["a2", "a3"] });
    const { linked } = await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a3"]);
    assert.deepEqual(linked, ["a2", "a3"], "the toast counts two, as the timeline line does");
    const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!.args;
    assert.deepEqual((link.where?.id as { in: string[] }).in, ["a2", "a3"]);
  });
}
