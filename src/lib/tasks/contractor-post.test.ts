import test from "node:test";
import assert from "node:assert/strict";
import {
  POST_ITEM_SLACK_MS,
  addComment,
  commentSummary,
  findOwnUpload,
  recordAttachment,
  removeAttachment,
  renameAttachment,
  takeBackContractorPost,
  withoutPostLine,
  type CommentInput,
  type Principal,
  type RemovedFile,
  type Tx,
} from "./core";

/**
 * A contractor's batch post and its Undo (uploads 2.7, question 5), the
 * record step's Retry, and staff removing a file, on a fake transaction. The
 * database run of the same cases lives outside the repo (the chunk 6 review's
 * harness); these pin what the code asks the database for: the task lock
 * first, only open email rows, the post's own line by its eventId, the batch
 * mark, and soft deletes for imported files.
 */

const ZACK: Principal = { kind: "contractor", contactId: "c-zack", label: "Zack Outlaw" };
const CONNOR: Principal = { kind: "staff", userId: "u-connor", label: "Connor Swofford" };
const POSTED = new Date("2026-10-26T15:00:00.000Z");

interface Call {
  model: string;
  op: string;
  args: unknown;
}

type CallArgs = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };
type Answer = (model: string, op: string, args: CallArgs) => unknown;

/** `answer` overrides a call's result when it returns anything but undefined. */
function fakeTx(answer?: Answer) {
  const calls: Call[] = [];
  const result = (model: string, op: string, args: CallArgs) => {
    const given = answer?.(model, op, args);
    if (given !== undefined) return given;
    if (model === "task" && op === "findUnique") return { id: "t1", title: "Tile the bath", status: "IN_PROGRESS", assigneeContactId: "c-zack" };
    if (model === "task" && op === "update") return { id: "t1" };
    if (model === "taskAccess" && op === "findUnique") {
      return { revokedAt: null, contact: { active: true, portalAccount: { status: "ACTIVE" } } };
    }
    if (model === "portalAccount" && op === "findUnique") return { status: "ACTIVE" };
    if (model === "user" && op === "findMany") return [{ id: "u-connor" }, { id: "u-pieter" }];
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany" || op === "deleteMany") return { count: 1 };
    return { id: `${model}-${calls.length}`, ...(args.data ?? {}) };
  };
  const raw = (kind: "$executeRaw" | "$queryRaw") => async (sql: TemplateStringsArray, ...values: unknown[]) => {
    const text = sql.join("?");
    calls.push({ model: kind, op: text, args: values });
    const given = answer?.(kind, text, {});
    return given ?? (kind === "$executeRaw" ? 1 : []);
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

const isWrite = (c: Call) => /^(create|update|upsert|delete)/.test(c.op) || (c.model === "$executeRaw" && !c.op.includes("FOR NO KEY UPDATE"));
const outboxInserts = (calls: Call[]) => calls.filter((c) => c.model === "$executeRaw" && c.op.includes('INSERT INTO "NotificationOutbox"'));
/** The item an outbox insert carried (enqueue passes it as JSON). */
const insertedItem = (c: Call) => JSON.parse((c.args as unknown[]).find((v) => typeof v === "string" && v.startsWith("{")) as string);

// ---------------------------------------------------------------------------
// The words of a comment's line
// ---------------------------------------------------------------------------

test("a comment's email line: the text or 'added files', then the file count", () => {
  assert.equal(commentSummary("Arrived on site", 0), '"Arrived on site"');
  assert.equal(commentSummary("Old tub out", 2), '"Old tub out" (+2 files)');
  assert.equal(commentSummary("", 1), "added files (+1 file)");
  assert.equal(commentSummary("", 3), "added files (+3 files)");
  assert.equal(commentSummary("x".repeat(300), 0), `"${"x".repeat(140)}"`, "140 characters, as before");
});

// ---------------------------------------------------------------------------
// addComment: the batch mark and the eventId on the line (fixes 2 and 3)
// ---------------------------------------------------------------------------

test("addComment: a contractor's batch is marked, and its line names its event", async () => {
  const { tx, calls } = fakeTx((model, op, args) =>
    model === "taskEvent" && op === "create" ? { id: "e-batch", ...args.data } : undefined,
  );
  const event = await addComment(tx, "t1", { body: "", attachmentIds: ["a1", "a2"], batch: true }, ZACK, POSTED);
  assert.equal(event.id, "e-batch");
  const created = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
  assert.deepEqual(created.data?.data, { batch: true });
  const inserts = outboxInserts(calls);
  assert.equal(inserts.length, 2, "one line per partner");
  for (const c of inserts) {
    assert.deepEqual(insertedItem(c), {
      kind: "COMMENT",
      actorLabel: "Zack Outlaw",
      summary: "added files (+1 file)",
      at: POSTED.toISOString(),
      eventId: "e-batch",
    });
  }
});

test("addComment: a written update, a Mark done's photos and a staff post are never marked as a batch", async () => {
  const cases: [CommentInput, Principal][] = [
    [{ body: "Tile set", attachmentIds: ["a1"], batch: true }, ZACK],
    [{ body: "", attachmentIds: ["a1"] }, ZACK],
    [{ body: "", visibility: "SHARED", attachmentIds: ["a1"], batch: true }, CONNOR],
  ];
  for (const [input, p] of cases) {
    const { tx, calls } = fakeTx();
    await addComment(tx, "t1", input, p, POSTED);
    const created = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
    assert.deepEqual(created.data?.data, {}, JSON.stringify(input));
  }
});

test("addComment: every line it queues carries the comment's eventId", async () => {
  const { tx, calls } = fakeTx((model, op, args) =>
    model === "taskEvent" && op === "create" ? { id: "e-text", ...args.data } : undefined,
  );
  await addComment(tx, "t1", { body: "Arrived on site" }, ZACK, POSTED);
  assert.deepEqual(
    outboxInserts(calls).map((c) => [insertedItem(c).summary, insertedItem(c).eventId]),
    [
      ['"Arrived on site"', "e-text"],
      ['"Arrived on site"', "e-text"],
    ],
  );
});

// ---------------------------------------------------------------------------
// withoutPostLine: which line is the post's (fix 2)
// ---------------------------------------------------------------------------

const item = (over: Record<string, unknown>) => ({ kind: "COMMENT", actorLabel: "Zack Outlaw", summary: "added files (+2 files)", at: POSTED.toISOString(), ...over });
const POST = { eventId: "e-a", actorLabel: "Zack Outlaw", summary: "added files (+2 files)", at: POSTED };

test("withoutPostLine: the post's line is the one carrying its eventId, never another post's of the same size", () => {
  const b = item({ eventId: "e-b", at: new Date(POSTED.getTime() + 1_000).toISOString() });
  const text = item({ summary: '"Arrived"', eventId: "e-c" });
  // A's line already went out; B's, the same size a second later, is all this bundle holds of either.
  assert.equal(withoutPostLine([text, b], POST), null, "nothing of A's here, so the row is left alone");
  assert.deepEqual(withoutPostLine([text, item({ eventId: "e-a" }), b], POST), [text, b]);
});

test("withoutPostLine: an older line with no eventId is found the old way, nearest first, within the slack", () => {
  const near = item({ at: new Date(POSTED.getTime() + 200).toISOString() });
  const far = item({ at: new Date(POSTED.getTime() + 3_000).toISOString() });
  const outside = item({ at: new Date(POSTED.getTime() + POST_ITEM_SLACK_MS + 1).toISOString() });
  assert.deepEqual(withoutPostLine([far, near], POST), [far]);
  assert.equal(withoutPostLine([outside], POST), null);
  assert.equal(withoutPostLine([item({ actorLabel: "Mike Other" })], POST), null, "someone else's");
  assert.equal(withoutPostLine([item({ summary: "added files (+3 files)" })], POST), null, "another size");
  assert.equal(withoutPostLine([item({ kind: "ATTACHMENT" })], POST), null, "not a comment");
});

test("withoutPostLine: in a mixed row the eventId wins, and an item naming another event is never matched the old way", () => {
  const old = item({});
  const own = item({ eventId: "e-a", at: new Date(POSTED.getTime() + 2_000).toISOString() });
  assert.deepEqual(withoutPostLine([old, own], POST), [old], "the tagged line goes; the untagged look-alike stays");
  assert.equal(withoutPostLine([item({ eventId: "e-z" })], POST), null);
  assert.deepEqual(withoutPostLine([item({ eventId: "e-a" })], POST), [], "the only line: the row is left empty");
});

test("withoutPostLine: a STATUS item that names the post's event is not its line", () => {
  const status = { kind: "STATUS", actorLabel: "Zack Outlaw", summary: 'marked "Tile the bath" done', at: POSTED.toISOString(), eventId: "e-a" };
  assert.equal(withoutPostLine([status], POST), null);
});

test("withoutPostLine: items that aren't a list, and junk inside one, are left alone", () => {
  assert.equal(withoutPostLine(null, POST), null);
  assert.equal(withoutPostLine({}, POST), null);
  assert.deepEqual(withoutPostLine([null, 3, item({ eventId: "e-a" })], POST), [null, 3]);
});

// ---------------------------------------------------------------------------
// takeBackContractorPost (fixes 1, 2, 3 and 10)
// ---------------------------------------------------------------------------

const BATCH_EVENT = { createdAt: POSTED };
const within = { undoable: () => true };
const SECONDS = (s: number) => new Date(POSTED.getTime() + s * 1000);

/** Open bundles for both partners: A's line, B's look-alike, and a text line. */
const bundles = [
  { id: "o1", items: [item({ summary: '"Arrived"', eventId: "e-x" }), item({ eventId: "e-a" }), item({ eventId: "e-b" })] },
  { id: "o2", items: [item({ eventId: "e-a" })] },
];

function undoTx(over: Answer = () => undefined) {
  return fakeTx((model, op, args) => {
    const given = over(model, op, args);
    if (given !== undefined) return given;
    if (model === "taskEvent" && op === "findFirst") return BATCH_EVENT;
    if (model === "taskAttachment" && op === "updateMany") return { count: 2 };
    if (model === "$queryRaw" && op.includes('FROM "NotificationOutbox"')) return bundles;
    return undefined;
  });
}

test("takeBackContractorPost: the task row is locked before anything else is read or written", async () => {
  const { tx, calls } = undoTx();
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  assert.equal(calls[0].model, "$executeRaw");
  assert.match(calls[0].op, /SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/);
  assert.deepEqual(calls[0].args, ["t1"]);
});

test("takeBackContractorPost: only email rows still open and never tried are read, each locked, in id order", async () => {
  const { tx, calls } = undoTx();
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  const read = calls.find((c) => c.model === "$queryRaw")!;
  assert.match(read.op, /"sentAt" IS NULL AND "openKey" IS NOT NULL AND "attempts" = 0/);
  assert.match(read.op, /ORDER BY "id"\s+FOR UPDATE/);
  assert.deepEqual(read.args, ["t1"]);
  // And every write to a row repeats the same conditions.
  const open = { sentAt: null, openKey: { not: null }, attempts: 0 };
  const rowWrites = calls.filter((c) => c.model === "notificationOutbox");
  assert.deepEqual(
    rowWrites.map((c) => [c.op, (c.args as CallArgs).where]),
    [
      ["updateMany", { id: "o1", ...open }],
      ["deleteMany", { id: "o2", ...open }],
    ],
  );
});

test("takeBackContractorPost: only the post's own line goes; a same-size post's line moments later stays", async () => {
  const { tx, calls } = undoTx();
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  const update = calls.find((c) => c.model === "notificationOutbox" && c.op === "updateMany")!.args as CallArgs;
  const kept = update.data?.items as { eventId?: string }[];
  assert.deepEqual(kept.map((i) => i.eventId), ["e-x", "e-b"]);
  assert.ok(!calls.some((c) => c.model === "$executeRaw" && /NotificationOutbox/.test(c.op)), "no raw writes to the outbox");
});

test("takeBackContractorPost: the update and only its files are soft-deleted, at the same instant", async () => {
  const { tx, calls } = undoTx();
  const now = SECONDS(4);
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, now);
  const ev = calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args as CallArgs;
  assert.deepEqual(ev, { where: { id: "e-a" }, data: { deletedAt: now } });
  const files = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!.args as CallArgs;
  assert.deepEqual(files, { where: { eventId: "e-a", taskId: "t1", uploadedByContactId: "c-zack", deletedAt: null }, data: { deletedAt: now } });
  assert.ok(!calls.some((c) => c.op === "delete"), "nothing is hard-deleted");
});

test("takeBackContractorPost: only the poster's own post marked as a batch, with no text, is looked for", async () => {
  const { tx, calls } = undoTx();
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!.args as CallArgs;
  assert.deepEqual(find.where, {
    id: "e-a",
    taskId: "t1",
    kind: "COMMENT",
    actorContactId: "c-zack",
    deletedAt: null,
    body: null,
    data: { path: ["batch"], equals: true },
  });
});

test("takeBackContractorPost: a Mark done's photos (not a batch) are refused, and nothing is written", async () => {
  // The batch filter finds nothing: the Mark done comment has no `batch` mark.
  const { tx, calls } = undoTx((model, op) => (model === "taskEvent" && op === "findFirst" ? null : undefined));
  await assert.rejects(takeBackContractorPost(tx, "t1", "e-done", ZACK, within, SECONDS(3)), /That update is already gone\./);
  assert.deepEqual(calls.filter(isWrite), []);
});

test("takeBackContractorPost: a closed job is refused before the post is even looked up", async () => {
  for (const status of ["DONE", "CANCELED"]) {
    const { tx, calls } = undoTx((model, op) => (model === "task" && op === "findUnique" ? { status } : undefined));
    await assert.rejects(takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3)), /This job is closed\./);
    assert.ok(!calls.some((c) => c.model === "taskEvent"), status);
    assert.deepEqual(calls.filter(isWrite), [], status);
  }
});

test("takeBackContractorPost: a job in Review still takes a late batch back", async () => {
  const { tx, calls } = undoTx((model, op) => (model === "task" && op === "findUnique" ? { status: "REVIEW" } : undefined));
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  assert.ok(calls.some((c) => c.model === "taskEvent" && c.op === "update"));
});

test("takeBackContractorPost: past the window, revoked access or no such job: refused, nothing written", async () => {
  const late = undoTx();
  await assert.rejects(
    takeBackContractorPost(late.tx, "t1", "e-a", ZACK, { undoable: () => false }, SECONDS(16)),
    /It's too late to take that back\./,
  );
  assert.deepEqual(late.calls.filter(isWrite), []);

  const revoked = undoTx((model, op) => (model === "taskAccess" && op === "findUnique" ? { revokedAt: new Date(), contact: { active: true, portalAccount: { status: "ACTIVE" } } } : undefined));
  await assert.rejects(takeBackContractorPost(revoked.tx, "t1", "e-a", ZACK, within, SECONDS(3)), /You don't have access to this job\./);
  assert.deepEqual(revoked.calls.filter(isWrite), []);

  const gone = undoTx((model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await assert.rejects(takeBackContractorPost(gone.tx, "t1", "e-a", ZACK, within, SECONDS(3)), /That task no longer exists\./);
});

test("takeBackContractorPost: the window is judged on the post's own time", async () => {
  const seen: Date[] = [];
  const { tx } = undoTx();
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, { undoable: (at) => (seen.push(at), true) }, SECONDS(3));
  assert.deepEqual(seen, [POSTED]);
});

test("takeBackContractorPost: staff can't use it", async () => {
  const { tx, calls } = undoTx();
  await assert.rejects(takeBackContractorPost(tx, "t1", "e-a", CONNOR, within, SECONDS(3)), /Only the contractor/);
  assert.deepEqual(calls, []);
});

test("takeBackContractorPost: a row already claimed by a send run is never read, so never rewritten or deleted", async () => {
  // The query asks for open, untried rows only; a claimed row (openKey cleared, attempts 1) isn't among them.
  const { tx, calls } = undoTx((model, op) => (model === "$queryRaw" && op.includes("NotificationOutbox") ? [] : undefined));
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  assert.ok(!calls.some((c) => c.model === "notificationOutbox"));
});

test("takeBackContractorPost: an older line with no eventId is still found by its words and time", async () => {
  const legacy = [{ id: "o9", items: [item({ summary: "added files (+2 files)", at: new Date(POSTED.getTime() + 300).toISOString() })] }];
  const { tx, calls } = undoTx((model, op) => (model === "$queryRaw" && op.includes("NotificationOutbox") ? legacy : undefined));
  await takeBackContractorPost(tx, "t1", "e-a", ZACK, within, SECONDS(3));
  assert.deepEqual(
    calls.filter((c) => c.model === "notificationOutbox").map((c) => c.op),
    ["deleteMany"],
  );
});

// ---------------------------------------------------------------------------
// Lock order everywhere a line is queued (fix 10)
// ---------------------------------------------------------------------------

test("recordAttachment: the task row is written before any email row, as every other queueing write does", async () => {
  const { tx, calls } = fakeTx((model, op, args) => (model === "taskAttachment" && op === "create" ? { id: "a1", ...args.data } : undefined));
  const meta = { url: "https://x.private.blob.vercel-storage.com/tasks/t1/orig/q.pdf", pathname: "tasks/t1/orig/q.pdf", filename: "q.pdf", size: 10, contentType: "application/pdf" };
  await recordAttachment(tx, "t1", meta, CONNOR, { visibility: "SHARED" }, POSTED);
  const taskUpdate = calls.findIndex((c) => c.model === "task" && c.op === "update");
  const firstInsert = calls.findIndex((c) => c.model === "$executeRaw" && c.op.includes("NotificationOutbox"));
  assert.ok(taskUpdate >= 0 && firstInsert > taskUpdate, `task update at ${taskUpdate}, first email row at ${firstInsert}`);
});

test("recordAttachment: the task row is locked before the task is read, so a reassignment that landed meanwhile decides who the file is for", async () => {
  // Pieter gave the job to Jose while Connor's upload waited on the row: the read under the lock sees Jose.
  const { tx, calls } = fakeTx((model, op, args) => {
    if (model === "task" && op === "findUnique") return { id: "t1", title: "Tile the bath", status: "IN_PROGRESS", assigneeContactId: "c-jose" };
    return model === "taskAttachment" && op === "create" ? { id: "a1", ...args.data } : undefined;
  });
  const meta = { url: "https://x.private.blob.vercel-storage.com/tasks/t1/orig/q.pdf", pathname: "tasks/t1/orig/q.pdf", filename: "q.pdf", size: 10, contentType: "application/pdf" };
  await recordAttachment(tx, "t1", meta, CONNOR, { visibility: "SHARED" }, POSTED);
  assert.equal(calls[0].model, "$executeRaw", "the lock comes before anything is read");
  assert.match(calls[0].op, /^SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.deepEqual(calls[0].args, ["t1"]);
  assert.ok(calls.findIndex((c) => c.model === "task" && c.op === "findUnique") > 0, "the task is read under the lock");
  assert.equal(calls.filter((c) => c.model === "$executeRaw" && c.op.includes("FOR NO KEY UPDATE")).length, 1, "one lock, not two");
  const att = calls.find((c) => c.model === "taskAttachment" && c.op === "create")!.args as CallArgs;
  assert.equal(att.data?.audienceContactId, "c-jose", "addressed to whoever has the job now");
  const inserts = outboxInserts(calls);
  assert.ok(inserts.some((c) => (c.args as unknown[]).includes("c-jose")), "Jose's email");
  assert.ok(!inserts.some((c) => (c.args as unknown[]).includes("c-zack")), "never the contractor who just lost the job");
});

test("recordAttachment: a contractor who lost the job while the upload waited is refused under the lock, and nothing is written", async () => {
  const { tx, calls } = fakeTx((model, op) => (model === "taskAccess" && op === "findUnique" ? null : undefined));
  const meta = { url: "https://x.private.blob.vercel-storage.com/tasks/t1/orig/p.jpg", pathname: "tasks/t1/orig/p.jpg", filename: "p.jpg", size: 10, contentType: "image/jpeg" };
  await assert.rejects(recordAttachment(tx, "t1", meta, ZACK, { standalone: false }, POSTED), /don't have access/);
  assert.equal(calls[0].model, "$executeRaw");
  assert.ok(calls.findIndex((c) => c.model === "taskAccess" && c.op === "findUnique") > 0, "the access check runs under the lock");
  assert.deepEqual(calls.filter(isWrite), [], "no file row, no stamp, no line, no email");
});

test("addComment: the task row is written before any email row", async () => {
  const { tx, calls } = fakeTx();
  await addComment(tx, "t1", { body: "Arrived" }, ZACK, POSTED);
  const taskUpdate = calls.findIndex((c) => c.model === "task" && c.op === "update");
  const firstInsert = calls.findIndex((c) => c.model === "$executeRaw" && c.op.includes("NotificationOutbox"));
  assert.ok(taskUpdate >= 0 && firstInsert > taskUpdate);
});

// ---------------------------------------------------------------------------
// The record step's Retry (fix 7)
// ---------------------------------------------------------------------------

test("findOwnUpload: the same path on the same task, uploaded by the same person, not removed", async () => {
  const contractor = fakeTx((model, op) => (model === "taskAttachment" && op === "findFirst" ? { id: "a1" } : undefined));
  assert.deepEqual(await findOwnUpload(contractor.tx, "t1", "tasks/t1/orig/p-x7Q.jpg", ZACK), { id: "a1" });
  assert.deepEqual((contractor.calls[0].args as CallArgs).where, {
    taskId: "t1",
    pathname: "tasks/t1/orig/p-x7Q.jpg",
    deletedAt: null,
    uploadedByContactId: "c-zack",
  });

  const staff = fakeTx();
  assert.equal(await findOwnUpload(staff.tx, "t1", "tasks/t1/orig/q.pdf", CONNOR), null);
  assert.deepEqual((staff.calls[0].args as CallArgs).where, { taskId: "t1", pathname: "tasks/t1/orig/q.pdf", deletedAt: null, uploadedByUserId: "u-connor" });
});

test("findOwnUpload: a writer that never uploads asks nothing", async () => {
  for (const p of [{ kind: "system", label: "Repeats" }, { kind: "asana", label: "Asana sync" }] as Principal[]) {
    const { tx, calls } = fakeTx();
    assert.equal(await findOwnUpload(tx, "t1", "tasks/t1/orig/x.jpg", p), null);
    assert.deepEqual(calls, []);
  }
});

// ---------------------------------------------------------------------------
// Staff Remove (fix 9)
// ---------------------------------------------------------------------------

const file = (over: Partial<RemovedFile>): RemovedFile => ({
  id: "a1",
  taskId: "t1",
  asanaGid: null,
  ...over,
});

/** The file as removeAttachment reads it under the lock: on post `eventId` (null for a draft), named `filename`. */
const onPost = (eventId: string | null, more?: Answer, filename = "photo.jpg"): Answer => (model, op, args) =>
  more?.(model, op, args) ?? (model === "taskAttachment" && op === "findUnique" ? { eventId, filename } : undefined);
const fileWrites = (calls: Call[]) => calls.filter((c) => c.model === "taskAttachment" && c.op !== "findUnique");

test("removeAttachment: an imported file is only marked removed, so the delta sync doesn't bring it back", async () => {
  const now = new Date("2026-10-26T16:00:00Z");
  const { tx, calls } = fakeTx(onPost("e1"));
  assert.equal(await removeAttachment(tx, file({ asanaGid: "1209876543" }), CONNOR, now), true);
  assert.deepEqual(
    fileWrites(calls).map((c) => [c.op, c.args]),
    [["updateMany", { where: { id: "a1", deletedAt: null }, data: { deletedAt: now } }]],
  );
  assert.ok(!calls.some((c) => c.op === "delete" || c.op === "deleteMany"));
  const line = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
  // The line names the post the file was on, so that comment says "1 file removed".
  assert.deepEqual(line.data?.data, { attachmentId: "a1", filename: "photo.jpg", removed: true, eventId: "e1" });
});

test("removeAttachment: the removed line is Internal and emails nobody, and the task is locked first and stamped as edited", async () => {
  const now = new Date("2026-10-26T16:00:00Z");
  const { tx, calls } = fakeTx(onPost("e1"));
  assert.equal(await removeAttachment(tx, file({}), CONNOR, now), true);
  // A Shared line would reach the contractor's job page, and a Shared staff file line emails them "added photo.jpg".
  const line = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
  assert.equal(line.data?.visibility, "INTERNAL");
  assert.equal(line.data?.audienceContactId ?? null, null);
  assert.equal(outboxInserts(calls).length, 0);
  // The task row before the file, as a take-back takes them, and the stamp a rename makes (D25).
  assert.ok(calls[0].model === "$executeRaw" && calls[0].op.includes('FROM "Task"') && calls[0].op.includes("FOR NO KEY UPDATE"));
  assert.deepEqual(
    calls.filter((c) => c.model === "task" && c.op === "update").map((c) => c.args),
    [{ where: { id: "t1" }, data: { appEditedAt: now } }],
  );
});

test("removeAttachment: a file added in the app is deleted for good", async () => {
  const { tx, calls } = fakeTx(onPost("e1"));
  assert.equal(await removeAttachment(tx, file({}), CONNOR), true);
  assert.deepEqual(
    fileWrites(calls).map((c) => [c.op, c.args]),
    // Only while it is still up: one a comment's delete or a take-back stamped since the caller read it stays for Undo.
    [["deleteMany", { where: { id: "a1", deletedAt: null } }]],
  );
});

test("removeAttachment: a Remove that loses to a comment delete or a take-back deletes nothing and writes no line", async () => {
  // deleteTaskAttachment reads the file before its transaction. Between the read and the delete the post is taken off and
  // its files are stamped, so the row no longer matches `deletedAt: null` (a count of 0), whichever kind of file it is.
  for (const over of [{}, { asanaGid: "1209" }]) {
    const lost = fakeTx(
      onPost("e1", (model, op) => (model === "taskAttachment" && op === "deleteMany" ? { count: 0 } : model === "taskAttachment" && op === "updateMany" ? { count: 0 } : undefined)),
    );
    assert.equal(await removeAttachment(lost.tx, file(over), CONNOR), false);
    const attempts = fileWrites(lost.calls);
    assert.equal(attempts.length, 1);
    assert.deepEqual((attempts[0].args as { where: unknown }).where, { id: "a1", deletedAt: null }, "matched on the file still being up");
    assert.ok(!lost.calls.some((c) => c.model === "taskEvent" || (c.model === "task" && c.op === "update")), "no line and no stamp");
  }
});

test("removeAttachment: a remove that lost the race writes nothing, and a draft or a call with no one leaves no line", async () => {
  const lost = fakeTx(onPost("e1", (model, op) => (model === "taskAttachment" && /Many$/.test(op) ? { count: 0 } : undefined)));
  assert.equal(await removeAttachment(lost.tx, file({ asanaGid: "1209" }), CONNOR), false);
  assert.ok(!lost.calls.some((c) => c.model === "taskEvent"));
  assert.ok(!lost.calls.some((c) => c.model === "task" && c.op === "update"), "no stamp either");
  assert.ok(!lost.calls.some((c) => isWrite(c) && !(c.model === "taskAttachment" && /Many$/.test(c.op))), "only the remove that lost");

  const draft = fakeTx(onPost(null));
  await removeAttachment(draft.tx, file({}), CONNOR);
  assert.ok(!draft.calls.some((c) => c.model === "taskEvent"), "never posted");

  const unnamed = fakeTx(onPost("e1"));
  await removeAttachment(unnamed.tx, file({}));
  assert.ok(!unnamed.calls.some((c) => c.model === "taskEvent"), "the composer unreadying its own draft");
});

test("removeAttachment: which post the file is on is read under the task lock, not taken from the caller's earlier read", async () => {
  // deleteTaskAttachment read a draft; a send posted it (on e7) before the Remove got the task. It is a posted file now.
  const { tx, calls } = fakeTx(onPost("e7"));
  assert.equal(await removeAttachment(tx, file({}), CONNOR), true);
  const read = calls.findIndex((c) => c.model === "taskAttachment" && c.op === "findUnique");
  assert.ok(read > 0 && calls[0].op.includes("FOR NO KEY UPDATE"), "after the task lock");
  assert.ok(read < calls.findIndex((c) => c.model === "taskAttachment" && c.op === "deleteMany"), "before the delete");
  const line = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
  assert.equal((line.data?.data as { eventId?: string }).eventId, "e7");
});

test("removeAttachment: the removed line names the file as it is under the lock, with which post it is on", async () => {
  // deleteTaskAttachment read the file as "IMG_2231.jpg"; Pieter renamed it before the Remove got the task.
  const { tx, calls } = fakeTx(onPost("e1", undefined, "Kitchen before.jpg"));
  assert.equal(await removeAttachment(tx, file({}), CONNOR), true);
  const read = calls.find((c) => c.model === "taskAttachment" && c.op === "findUnique")!.args as CallArgs;
  assert.deepEqual(read.select, { eventId: true, filename: true }, "one read, under the lock");
  const line = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as CallArgs;
  assert.deepEqual(line.data?.data, { attachmentId: "a1", filename: "Kitchen before.jpg", removed: true, eventId: "e1" });
});

test("removeAttachment: a file already gone when the lock is held is left alone, with nothing written", async () => {
  const { tx, calls } = fakeTx((model, op) => (model === "taskAttachment" && op === "findUnique" ? null : undefined));
  assert.equal(await removeAttachment(tx, file({}), CONNOR), false);
  assert.deepEqual(calls.filter(isWrite), []);
});

// ---------------------------------------------------------------------------
// Renaming a file: a write that belongs to core and counts as an edit in the app
// ---------------------------------------------------------------------------

test("renameAttachment: the file takes its new name and the task is stamped as edited in the app", async () => {
  const now = new Date("2026-10-26T17:00:00Z");
  const { tx, calls } = fakeTx((model, op) => (model === "taskAttachment" && op === "findUnique" ? { taskId: "t9", deletedAt: null } : undefined));
  assert.deepEqual(await renameAttachment(tx, "a1", "Roof leak.jpg", CONNOR, now), { taskId: "t9" });
  assert.deepEqual(
    calls.filter((c) => c.model === "taskAttachment" && c.op === "update").map((c) => c.args),
    [{ where: { id: "a1" }, data: { filename: "Roof leak.jpg" } }],
  );
  // Without the stamp a CSV row nobody else touched is deleted with its task (D25), file and all.
  assert.deepEqual(
    calls.filter((c) => c.model === "task" && c.op === "update").map((c) => c.args),
    [{ where: { id: "t9" }, data: { appEditedAt: now } }],
  );
  assert.ok(!calls.some((c) => c.model === "taskEvent"), "no timeline line for a rename");
  assert.equal(outboxInserts(calls).length, 0, "and nobody is emailed");
});

test("renameAttachment: a file that is gone is refused, and nothing is written", async () => {
  for (const found of [null, { taskId: "t9", deletedAt: new Date() }]) {
    const { tx, calls } = fakeTx((model, op) => (model === "taskAttachment" && op === "findUnique" ? found : undefined));
    await assert.rejects(renameAttachment(tx, "a1", "x.jpg", CONNOR), /That file no longer exists\./);
    assert.ok(!calls.some(isWrite));
  }
});

test("renameAttachment: the task row is locked before the file is checked again and written", async () => {
  // The first read only names the task. Remove, a comment's delete and a take-back lock the task before the file.
  const { tx, calls } = fakeTx((model, op) => (model === "taskAttachment" && op === "findUnique" ? { taskId: "t9", deletedAt: null } : undefined));
  await renameAttachment(tx, "a1", "Roof leak.jpg", CONNOR);
  assert.deepEqual(
    calls.map((c) => (c.model === "$executeRaw" ? `lock ${(c.args as unknown[])[0]}` : `${c.model}.${c.op}`)),
    ["taskAttachment.findUnique", "lock t9", "taskAttachment.findUnique", "taskAttachment.update", "task.update"],
  );
  assert.match(calls[1].op, /^SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE$/);
});

test("renameAttachment: a rename that waited on a delete finds the file gone under the lock, and writes nothing", async () => {
  let reads = 0;
  const { tx, calls } = fakeTx((model, op) =>
    model === "taskAttachment" && op === "findUnique" ? (++reads === 1 ? { taskId: "t9" } : { taskId: "t9", deletedAt: new Date() }) : undefined,
  );
  await assert.rejects(renameAttachment(tx, "a1", "x.jpg", CONNOR), /That file no longer exists\./);
  assert.ok(calls.some((c) => c.model === "$executeRaw"), "it waited on the task");
  assert.ok(!calls.some(isWrite));
});
