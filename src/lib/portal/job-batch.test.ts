import test from "node:test";
import assert from "node:assert/strict";
import { JOB_CLOSED } from "@/lib/attachments/access";
import { addComment, type Tx } from "@/lib/tasks/core";
import { allOwnPosted, ownPosted, postBatchIn } from "./job-batch";
import { MAX_FILES_PER_POST } from "./job-view";
import { postInBatches } from "./recorded-uploads";

/**
 * The contractor's batch step by the job's status (uploads 2.7 and question
 * 4), on a fake transaction: an active job (In progress, Review) gets the
 * undoable batch post, a job HG approved or canceled gets the late line that
 * tells HG once, and an approve that lands between the step's status read and
 * addComment's own goes the late way in the same transaction. A send whose
 * files are all posted already answers quietly on any job, so the next piece
 * of a big batch goes. The database runs of the races are
 * job-batch.pg.test.ts (opt-in) and the chunk 6 harness.
 */

const ZACK = { kind: "contractor", contactId: "c-zack", label: "Zack Outlaw" } as const;

interface Call {
  model: string;
  op: string;
  args: CallArgs;
}
type CallArgs = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };

/** A file's row as allOwnPosted reads it: whose it is, whether it's posted, whether it was imported. */
type FileRow = { uploadedByContactId: string | null; eventId: string | null; asanaGid: string | null };
const POSTED_ROW: FileRow = { uploadedByContactId: "c-zack", eventId: "e-earlier", asanaGid: null };
const UNPOSTED_ROW: FileRow = { uploadedByContactId: "c-zack", eventId: null, asanaGid: null };
const MIKES_ROW: FileRow = { uploadedByContactId: "c-mike", eventId: null, asanaGid: null };

/**
 * A transaction that answers what the batch step and core ask. `statuses` are the task's status at each read of
 * it, the last one repeating (an approve between reads is ["IN_PROGRESS", "DONE"]); null is a task that is gone.
 * `postedIds` stands for the files' rows: an id in it reads as posted, any other as this contractor's unposted
 * file, and a link adds to it, so one fake serves several posts in a row. `taken` are files another send links
 * between this post's read of what's unposted and its own link.
 * The rows allOwnPosted reads by id answer as Postgres would: an id in `posted` is this contractor's posted file,
 * one in `gone` has no row (staff Remove deletes it), one in `unposted` (or any, when `unposted` isn't given) is his
 * unposted file, and any other is another contractor's. `rows` gives them outright.
 */
function fakeTx(
  opts: {
    statuses?: (string | null)[];
    unposted?: string[] | null;
    posted?: string[];
    gone?: string[];
    rows?: Record<string, FileRow>;
    access?: boolean;
    postedIds?: Set<string>;
    taken?: string[];
  } = {},
) {
  const calls: Call[] = [];
  const statuses = [...(opts.statuses ?? ["IN_PROGRESS"])];
  const linkedBy = new Map<string, string[]>();
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
      // A post reading back the rows on its event.
      const eventId = args.where?.eventId;
      if (typeof eventId === "string") return (linkedBy.get(eventId) ?? []).map((id) => ({ id }));
      const ids = ((args.where?.id as { in: string[] } | undefined)?.in ?? []) as string[];
      // allOwnPosted: the rows on this task with these ids, whatever they are.
      if (args.select?.uploadedByContactId) return ids.map((id) => rowOf(id)).filter((r): r is FileRow => r !== null);
      if (opts.postedIds) return ids.filter((id) => !opts.postedIds!.has(id)).map((id) => ({ id, kind: "IMAGE" }));
      return (opts.unposted === undefined ? ids : (opts.unposted ?? [])).map((id) => ({ id, kind: "IMAGE" }));
    }
    if (model === "taskAttachment" && op === "updateMany") {
      const asked = ((args.where?.id as { in: string[] } | undefined)?.in ?? []) as string[];
      const ids = asked.filter((id) => !opts.taken?.includes(id) && !opts.postedIds?.has(id));
      const eventId = args.data?.eventId;
      if (typeof eventId === "string") {
        linkedBy.set(eventId, [...(linkedBy.get(eventId) ?? []), ...ids]);
        for (const id of ids) opts.postedIds?.add(id);
      }
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
  function rowOf(id: string): FileRow | null {
    if (opts.rows) return opts.rows[id] ?? null;
    if (opts.postedIds) return opts.postedIds.has(id) ? POSTED_ROW : UNPOSTED_ROW;
    if (opts.posted?.includes(id)) return POSTED_ROW;
    if (opts.gone?.includes(id)) return null;
    return opts.unposted === undefined || opts.unposted?.includes(id) ? UNPOSTED_ROW : MIKES_ROW;
  }
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
  const { tx, calls } = fakeTx({ statuses: ["DONE"], unposted: [], posted: ["a1", "a2"] });
  assert.deepEqual(await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a2"]), { event: null, linked: [] }, "nothing new was told, so nothing is counted");
  assert.deepEqual(calls.filter(isWrite), []);
  const read = calls.find((c) => c.model === "taskAttachment" && c.op === "findMany" && c.args.select?.uploadedByContactId)!.args;
  assert.deepEqual(read.where, { id: { in: ["a1", "a2"] }, taskId: "t1" }, "the rows by id on this job, whoever's they are");
});

test("postBatchIn: a kept piece of posted files and one HG removed since answers quietly, so the pieces after it still go", async () => {
  // 49 posted by a post whose answer was lost, and one staff removed from the job (its row is gone): neither is new.
  const ids = Array.from({ length: MAX_FILES_PER_POST }, (_, i) => `a${i + 1}`);
  for (const status of ["IN_PROGRESS", "DONE"]) {
    const { tx, calls } = fakeTx({ statuses: [status], unposted: [], posted: ids.slice(0, -1), gone: ids.slice(-1) });
    assert.deepEqual(await postBatchIn(tx, "t1", ZACK, ids), { event: null, linked: [] }, status);
    assert.deepEqual(calls.filter(isWrite), [], status);
  }
});

test("allOwnPosted: every row left is this contractor's posted file on the job, and a removed one counts as done", async () => {
  const own = (rows: Record<string, FileRow>, ids: string[]) => allOwnPosted(fakeTx({ rows }).tx, "t1", "c-zack", ids);
  assert.equal(await own({ a1: POSTED_ROW, a2: POSTED_ROW }, ["a1", "a2", "a1"]), true, "duplicates count once");
  assert.equal(await own({ a1: POSTED_ROW }, ["a1", "a9"]), true, "a9 has no row: staff removed it, nothing to tell");
  assert.equal(await own({}, ["a9"]), true, "every one removed");
  assert.equal(await own({ a1: POSTED_ROW, b9: { ...POSTED_ROW, uploadedByContactId: "c-mike" } }, ["a1", "b9"]), false, "another contractor's");
  assert.equal(await own({ a1: POSTED_ROW, a2: UNPOSTED_ROW }, ["a1", "a2"]), false, "one not posted yet has something to tell");
  assert.equal(await own({ a1: { ...POSTED_ROW, asanaGid: "1209" } }, ["a1"]), false, "an imported file is history, not a send");
  assert.equal(await own({ a1: { ...POSTED_ROW, uploadedByContactId: null } }, ["a1"]), false, "a staff upload");
  const none = fakeTx();
  assert.equal(await allOwnPosted(none.tx, "t1", "c-zack", []), false);
  assert.deepEqual(none.calls, [], "nothing asked");
});

test("ownPosted: the contractor's own files on a batch post of this visit, with their kinds, for Mark done's count; a written update's never", async () => {
  const since = new Date("2026-10-27T09:00:00.000Z");
  const { tx, calls } = fakeTx({ unposted: ["a1", "a2"] });
  assert.deepEqual(await ownPosted(tx, "t1", "c-zack", ["a1", "a2"], since), [{ id: "a1", kind: "IMAGE" }, { id: "a2", kind: "IMAGE" }]);
  const asked = calls.find((c) => c.model === "taskAttachment" && c.op === "findMany")!.args;
  assert.deepEqual(asked.where, {
    id: { in: ["a1", "a2"] },
    taskId: "t1",
    uploadedByContactId: "c-zack",
    eventId: { not: null },
    createdAt: { gte: since },
    event: { is: { data: { path: ["batch"], equals: true } } },
    deletedAt: null,
    asanaGid: null,
  });
  // An older job with no move to In progress: every batch post of his counts.
  const old = fakeTx({ unposted: ["a1"] });
  await ownPosted(old.tx, "t1", "c-zack", ["a1"], null);
  const unbounded = old.calls.find((c) => c.model === "taskAttachment" && c.op === "findMany")!.args;
  assert.deepEqual((unbounded.where as { event: unknown }).event, { is: { data: { path: ["batch"], equals: true } } });
  assert.equal("createdAt" in (unbounded.where as object), false);
  const none = fakeTx();
  assert.deepEqual(await ownPosted(none.tx, "t1", "c-zack", [], since), []);
  assert.deepEqual(none.calls, [], "nothing asked");
});

test("postBatchIn: a send naming anything else posted or not this contractor's is still refused, late or active", async () => {
  for (const status of ["DONE", "IN_PROGRESS"]) {
    const some = fakeTx({ statuses: [status], unposted: [], posted: ["a1"] });
    await assert.rejects(postBatchIn(some.tx, "t1", ZACK, ["a1", "b9"]), /Write something or add a photo\./, status);
    assert.equal(outboxInserts(some.calls).length, 0, status);
  }
});

for (const status of ["IN_PROGRESS", "REVIEW"] as const) {
  test(`postBatchIn on a job ${status === "REVIEW" ? "in Review" : "in progress"}: a send whose files are all posted already answers quietly, with nothing written`, async () => {
    // The same piece sent again after its answer was lost. Refused, it would stop every piece after it.
    const { tx, calls } = fakeTx({ statuses: [status], unposted: [], posted: ["a1", "a2"] });
    assert.deepEqual(await postBatchIn(tx, "t1", ZACK, ["a1", "a2"]), { event: null, linked: [] }, "no event to undo, and nothing new counted");
    assert.deepEqual(calls.filter(isWrite), [], "no empty update");
    assert.equal(outboxInserts(calls).length, 0, "HG isn't told twice");
  });
}

test("postBatchIn: a 50-file piece posted already (its answer lost) on an active job lets the next piece through", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `a${i + 1}`);
  // The first 50 went out with a post whose answer never came back; the page sends all 60 again, in pieces.
  const postedIds = new Set(ids.slice(0, MAX_FILES_PER_POST));
  const { tx, calls } = fakeTx({ statuses: ["IN_PROGRESS"], postedIds });
  const answers: unknown[] = [];
  const left = await postInBatches(ids, async (piece) => {
    try {
      answers.push(await postBatchIn(tx, "t1", ZACK, piece));
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(left, [], "every piece went: none waits for a send that never comes");
  assert.deepEqual(answers[0], { event: null, linked: [] }, "the posted piece answers quietly");
  const second = answers[1] as { event: { data: unknown } | null; linked: string[] };
  assert.deepEqual(second.event?.data, { batch: true }, "the next piece is its own batch post, for its Undo");
  assert.deepEqual(second.linked, ids.slice(MAX_FILES_PER_POST), "it told HG of the ten new files");
  assert.equal(events(calls).length, 1, "one new line, the second piece's");
  assert.equal(postedIds.size, 60, "all 60 are posted, each once");
});

for (const status of ["IN_PROGRESS", "DONE"] as const) {
  test(`postBatchIn on a job ${status === "DONE" ? "approved" : "in progress"}: linked is the files it actually linked, not its earlier read`, async () => {
    // a2 was unposted when the step read the files, and another send took it before this one linked them.
    const { tx } = fakeTx({ statuses: [status], unposted: ["a1", "a2", "a3"], taken: ["a2"] });
    const { linked } = await postBatchIn(tx, "t1", ZACK, ["a1", "a2", "a3"]);
    assert.deepEqual(linked, ["a1", "a3"], "the toast counts two, as the line does");
  });
}

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
