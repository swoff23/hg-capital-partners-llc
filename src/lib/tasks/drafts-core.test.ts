import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@/lib/drafts";
import {
  ARCHIVED_ASSIGNEE_LINE,
  DRAFT_DELETE_LINE,
  DraftRefusedError,
  TaskChangedError,
  TaskRuleError,
  addChecklistItem,
  addComment,
  addDraft,
  addDrafts,
  assertContractorAccess,
  createTask,
  deleteComment,
  deleteTask,
  discardDraft,
  discardDrafts,
  draftsFingerprint,
  editComment,
  patchTask,
  queueDueReminder,
  recordAttachment,
  removeAttachment,
  removeChecklistItem,
  renameAttachment,
  renameChecklistItem,
  renameTaskUnits,
  restoreChecklistItem,
  restoreComment,
  restoreDrafts,
  saveDrafts,
  setChecklistItem,
  setStatus,
  sweepDiscardedDrafts,
  undoAddDraft,
  undoAddDrafts,
  type ChecklistSnapshot,
  type DraftInput,
  type Principal,
  type Tx,
} from "./core";
import { MAX_WAITING_DRAFTS } from "./drafts";
import { APPROVAL_UNDO_MS, DISCARD_KEEP_MS } from "./rules";

/**
 * The draft state in core.ts (docs/specs/tasks-from-claude.md 6.1), on a fake
 * transaction that keeps every call in order, as core.test.ts does: what a
 * draft's save writes and what it leaves out, that nothing on a draft reaches
 * a contractor, the order Add and its Undo take their rows, and that Discard
 * marks a draft and deletes nothing. These run in `npm test`;
 * drafts.pg.test.ts runs the same paths on Postgres.
 */

const PIETER: Principal = { kind: "staff", userId: "u-pieter", label: "Pieter Louw" };
const CONNOR: Principal = { kind: "staff", userId: "u-connor", label: "Connor Swofford" };
const ZACK: Principal = { kind: "contractor", contactId: "c-zack", label: "Zack Reading" };
const NOW = new Date("2026-11-20T19:00:00Z");

interface Call {
  model: string;
  op: string;
  args: unknown;
}
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };
type Answer = (model: string, op: string, args: Args) => unknown;

/** Zack has a login, a first sign-in and Job emails on, so anything queued for him would show as an outbox insert. */
function fakeTx(row: Record<string, unknown> = {}, answer?: Answer) {
  const calls: Call[] = [];
  const stored = {
    id: "t1",
    title: "Fix gutters pulling off the back",
    description: null,
    status: "DRAFT",
    dueDate: null,
    scheduledFor: null,
    propertyId: null,
    unitLabel: null,
    waitingOn: null,
    dealId: null,
    repeatRule: null,
    entryPermittedAt: null,
    assigneeUserId: null,
    assigneeContactId: "c-zack",
    assigneeName: null,
    assigneeEmail: null,
    autoKey: null,
    createdByUserId: "u-pieter",
    discardedAt: null,
    ...row,
  };
  const result = (model: string, op: string, args: Args) => {
    const given = answer?.(model, op, args);
    if (given !== undefined) return given;
    if (model === "task" && op === "findUnique") return args.where?.autoKey ? null : stored;
    if (model === "task" && (op === "update" || op === "create")) return { ...stored, ...args.data };
    if (model === "portalAccount" && op === "findUnique") return { status: "ACTIVE", lastSignInAt: NOW, jobEmails: true };
    if (model === "contact" && op === "findUnique") return { id: "c-zack", fullName: "Zack Reading", active: true, archivedAt: null, portalAccount: { status: "ACTIVE", lastSignInAt: NOW, jobEmails: true } };
    if (model === "taskEvent" && op === "create") return { id: `ev-${calls.length}`, createdAt: NOW, ...args.data };
    if (model === "taskAttachment" && op === "create") return { id: "att-1", ...args.data };
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany" || op === "deleteMany" || op === "createMany") return { count: 0 };
    if (op === "count") return 0;
    return { id: `${model}-${calls.length}` };
  };
  const raw = (model: "$executeRaw" | "$queryRaw") => async (sql: TemplateStringsArray, ...values: unknown[]) => {
    const op = sql.join("?");
    calls.push({ model, op, args: values });
    if (model === "$executeRaw") return 1;
    return answer?.(model, op, {}) ?? [];
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
              return async (args: Args = {}) => {
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

const named = (calls: Call[]) => calls.map((c) => (c.model.startsWith("$") ? `${c.model}:${c.op.replace(/\s+/g, " ").trim().slice(0, 44)}` : `${c.model}.${c.op}`));
const isEmail = (c: Call) => c.model === "$executeRaw" && c.op.includes('INSERT INTO "NotificationOutbox"');
const isAccess = (c: Call) => c.model === "taskAccess";
const writes = (calls: Call[]) => calls.filter((c) => /^(create|update|upsert|delete)/.test(c.op) && !c.model.startsWith("$"));
const dataOf = (c: Call | undefined) => (c?.args as { data: Record<string, unknown> }).data;
const find = (calls: Call[], model: string, op: string) => calls.find((c) => c.model === model && c.op === op);
const rejects = (p: Promise<unknown>, message: string) => assert.rejects(p, (err: unknown) => err instanceof TaskRuleError && err.message === message);

// ---------------------------------------------------------------------------
// Saving a draft
// ---------------------------------------------------------------------------

test("a draft's save: a Draft under its own key, a 'created' line through Claude, a checklist, and no access or email", async () => {
  const { tx, calls } = fakeTx();
  const task = await createTask(
    tx,
    { title: " Fix gutters ", assignee: { contactId: "c-zack" }, status: "SCHEDULED", checklist: [{ title: "Rehang the downspout" }], draft: { batchKey: "b-1", index: 2 } },
    PIETER,
    NOW,
  );
  assert.equal(task.status, "DRAFT", "whatever status came with it (D5)");
  const made = dataOf(find(calls, "task", "create"));
  assert.deepEqual([made.title, made.status, made.autoKey, made.createdByUserId, made.assigneeContactId], ["Fix gutters", "DRAFT", "claude:u-pieter:b-1:2", "u-pieter", "c-zack"]);
  // The line Activity reads as "Pieter created this task", "via Claude" (D14): the partner is the actor.
  const line = dataOf(find(calls, "taskEvent", "create"));
  assert.deepEqual([line.kind, line.source, line.actorUserId, line.actorLabel], ["CREATED", "CLAUDE", "u-pieter", "Pieter Louw"]);
  assert.deepEqual(line.data, { to: { userId: null, contactId: "c-zack" } });
  // The checklist goes in with one statement, each item in the place addChecklistItem would give it.
  assert.deepEqual((find(calls, "taskChecklistItem", "createMany")!.args as { data: unknown }).data, [{ taskId: "t1", title: "Rehang the downspout", checkKey: null, position: 0 }]);
  assert.ok(!find(calls, "taskChecklistItem", "create"));
  // The two things a new task does for its contractor are skipped, and so is the deal's line.
  assert.ok(!calls.some(isAccess), "no access row");
  assert.ok(!calls.some(isEmail), "no email row");
  assert.ok(!calls.some((c) => c.model === "portalAccount"), "the email rule isn't even asked");
  assert.ok(!calls.some((c) => c.model === "dealNote"));
  // One save at a time per partner and key, taken before the key is looked for.
  const lock = calls.findIndex((c) => c.model === "$executeRaw" && c.op.includes("pg_advisory_xact_lock"));
  const lookup = calls.findIndex((c) => c.model === "task" && c.op === "findUnique");
  assert.ok(lock >= 0 && lock < lookup && lookup < calls.findIndex((c) => c.model === "task" && c.op === "create"));
  assert.deepEqual(calls[lock].args, [7305, "claude:u-pieter:b-1:"]);
});

test("a task made in the app is as it was: To do, an APP line, access and the email for its contractor", async () => {
  const { tx, calls } = fakeTx({ status: "OPEN" });
  const task = await createTask(tx, { title: "Fix gutters", assignee: { contactId: "c-zack" } }, PIETER, NOW);
  assert.equal(task.status, "OPEN");
  assert.equal(dataOf(find(calls, "taskEvent", "create")).source, "APP");
  assert.equal(dataOf(find(calls, "task", "create")).autoKey, null);
  assert.ok(find(calls, "taskAccess", "upsert"));
  assert.equal(calls.filter(isEmail).length, 1);
  assert.ok(!calls.some((c) => c.op.includes("pg_advisory_xact_lock")));
});

test("the same save sent again returns the draft already there and writes nothing", async () => {
  const saved = { id: "t-first", title: "Fix gutters", status: "DRAFT", autoKey: "claude:u-pieter:b-1:0" };
  const { tx, calls } = fakeTx({}, (model, op, args) => (model === "task" && op === "findUnique" && args.where?.autoKey === "claude:u-pieter:b-1:0" ? saved : undefined));
  const task = await createTask(tx, { title: "Fix the gutters, reworded", draft: { batchKey: "b-1", index: 0 } }, PIETER, NOW);
  assert.equal(task.id, "t-first");
  assert.deepEqual(writes(calls), []);
});

test("a new task's checklist is one insert: trimmed, blanks left out, in order from 0, with each item's Missing info key", async () => {
  const { tx, calls } = fakeTx({ status: "OPEN" });
  await createTask(
    tx,
    { title: "Fill in the gaps", checklist: [{ title: "  Lockbox code " }, { title: "   " }, { title: "Water account", checkKey: "water|u1" }, { title: "" }, { title: "Gas account" }] },
    PIETER,
    NOW,
  );
  const inserts = calls.filter((c) => c.model === "taskChecklistItem");
  assert.deepEqual(inserts.map((c) => c.op), ["createMany"], "one statement for the whole checklist, and no read of a last position");
  assert.deepEqual((inserts[0].args as { data: unknown }).data, [
    { taskId: "t1", title: "Lockbox code", checkKey: null, position: 0 },
    { taskId: "t1", title: "Water account", checkKey: "water|u1", position: 1 },
    { taskId: "t1", title: "Gas account", checkKey: null, position: 2 },
  ]);
  // No second stamp: the row was made with it a statement earlier.
  assert.deepEqual(calls.filter((c) => c.model === "task").map((c) => c.op), ["create"]);
  // No checklist, or only blanks: no insert at all.
  const none = fakeTx({ status: "OPEN" });
  await createTask(none.tx, { title: "No list", checklist: [{ title: " " }] }, PIETER, NOW);
  assert.ok(!none.calls.some((c) => c.model === "taskChecklistItem"));
});

test("a draft saved with Permission to enter says both lines came through Claude; a task made in the app says neither did", async () => {
  // Somebody lives there today, so the permission is kept (tenants/living.ts homeOccupied).
  const lived: Answer = (model, op) => {
    if (model === "property" && op === "findUnique") return { units: [] };
    if (model === "lease" && op === "findMany") return [{ id: "l1", unitId: null, movesIn: new Date("2026-01-01T00:00:00Z"), movesOut: null, tenants: [] }];
    return undefined;
  };
  const draft = fakeTx({}, lived);
  await createTask(draft.tx, { title: "Fix the faucet", propertyId: "p1", entryPermitted: true, draft: { batchKey: "b-1", index: 0 } }, PIETER, NOW);
  const lines = draft.calls.filter((c) => c.model === "taskEvent" && c.op === "create").map(dataOf);
  assert.deepEqual(lines.map((l) => [l.kind, l.source, l.actorUserId]), [["CREATED", "CLAUDE", "u-pieter"], ["ACCESS", "CLAUDE", "u-pieter"]]);
  assert.deepEqual(lines[1].data, { entry: { from: false, to: true } });

  const app = fakeTx({ status: "OPEN" }, lived);
  await createTask(app.tx, { title: "Fix the faucet", propertyId: "p1", entryPermitted: true }, PIETER, NOW);
  assert.deepEqual(app.calls.filter((c) => c.model === "taskEvent" && c.op === "create").map((c) => [dataOf(c).kind, dataOf(c).source]), [["CREATED", "APP"], ["ACCESS", "APP"]]);
});

// ---------------------------------------------------------------------------
// One save: the cap, the key, the order
// ---------------------------------------------------------------------------

const DRAFTS: DraftInput[] = [{ title: "Gutters", assignee: { contactId: "c-zack" } }, { title: "Faucet" }, { title: "Permit", checklist: [{ title: "Call the city" }] }];

test("a save's fingerprint is the drafts as sent: the same drafts however built, and nothing else", () => {
  const sent = draftsFingerprint(DRAFTS);
  assert.match(sent, /^[0-9a-f]{64}$/);
  // Key order and an absent optional field don't change it.
  assert.equal(draftsFingerprint([{ assignee: { contactId: "c-zack" }, title: "Gutters" }, { title: "Faucet", description: undefined }, { checklist: [{ title: "Call the city" }], title: "Permit" }]), sent);
  // A different word, a different order, one more or one fewer does.
  assert.notEqual(draftsFingerprint([{ ...DRAFTS[0], title: "Gutter" }, DRAFTS[1], DRAFTS[2]]), sent);
  assert.notEqual(draftsFingerprint([DRAFTS[1], DRAFTS[0], DRAFTS[2]]), sent);
  assert.notEqual(draftsFingerprint(DRAFTS.slice(0, 2)), sent);
  assert.notEqual(draftsFingerprint([...DRAFTS, { title: "Roof" }]), sent);
  assert.notEqual(draftsFingerprint([DRAFTS[0], DRAFTS[1], { title: "Permit", checklist: [{ title: "Call the county" }] }]), sent);
  // With nothing else said about what was sent, it is the drafts themselves.
  assert.equal(sent, createHash("sha256").update(stableJson(DRAFTS)).digest("hex"));
});

test("a draft that carries what its sender sent is told by that alone, whatever its fields were worked out to be", () => {
  // The connector's draft: Claude sent unit "2a" and Zack's id; the fields are what today's records made of them.
  const asSent = { title: "Fix the faucet", unitLabel: "2a", assignee: "c:c-zack" };
  const first: DraftInput = { title: "Fix the faucet", propertyId: "p1", unitLabel: "2A", assignee: { contactId: "c-zack" }, entryPermitted: true, asSent };
  const sent = draftsFingerprint([first]);
  // Sent again after the unit was relabeled, removed, Zack archived (the draft falls to the partner) or the property
  // archived: every worked-out field differs, and it is the same send.
  for (const later of [
    { ...first, unitLabel: "Unit 2A" },
    { ...first, unitLabel: null },
    { ...first, assignee: { userId: "u-pieter" }, entryPermitted: false },
    { title: "Fix the faucet", propertyId: null, unitLabel: null, assignee: { userId: "u-pieter" }, asSent: { assignee: "c:c-zack", unitLabel: "2a", title: "Fix the faucet" } },
  ] satisfies DraftInput[]) {
    assert.equal(draftsFingerprint([later]), sent);
  }
  // What was sent differing is another save, though the fields come out the same.
  assert.notEqual(draftsFingerprint([{ ...first, asSent: { ...asSent, unitLabel: "2b" } }]), sent);
  // And it is never confused with a draft that says nothing of what was sent.
  assert.notEqual(draftsFingerprint([{ ...first, asSent: undefined }]), sent);
  assert.notEqual(draftsFingerprint([asSent as unknown as DraftInput]), sent);
});

test("what its sender sent goes no further than the fingerprint: it is on no row a save writes", async () => {
  const { tx, calls } = fakeTx();
  const marker = "AS-SENT-ONLY";
  await saveDrafts(tx, "b-sent", [{ title: "Gutters", asSent: { title: marker } }], PIETER, undefined, NOW);
  const written = calls.filter((c) => /^(create|update)/.test(c.op)).map((c) => JSON.stringify(c.args));
  assert.ok(written.length > 0 && written.every((row) => !row.includes(marker)));
  // The "created" line holds the fingerprint of it, and that is all.
  const line = dataOf(find(calls, "taskEvent", "create"));
  assert.deepEqual(line.data, { sent: draftsFingerprint([{ title: "Gutters", asSent: { title: marker } }]) });
});

test("a new save: the partner's lock, then the key's, then the count, then the check, then the drafts last first", async () => {
  const order: string[] = [];
  const { tx, calls } = fakeTx();
  const out = await saveDrafts(tx, "b-1", DRAFTS, PIETER, async () => void order.push(`check after ${calls.length} calls`), NOW);
  assert.equal(out.kind, "saved");
  const locks = calls.filter((c) => c.model === "$executeRaw" && c.op.includes("pg_advisory_xact_lock")).map((c) => c.args);
  assert.deepEqual(locks.slice(0, 2), [[7306, "u-pieter"], [7305, "claude:u-pieter:b-1:"]], "the partner's saves first, then this save's key");
  const count = calls.findIndex((c) => c.model === "task" && c.op === "count");
  const firstCreate = calls.findIndex((c) => c.model === "task" && c.op === "create");
  assert.ok(count > 1 && count < firstCreate, "counted under both locks, before anything is written");
  assert.deepEqual((calls[count].args as Args).where, { status: "DRAFT", discardedAt: null, OR: [{ createdByUserId: "u-pieter" }, { createdByUserId: null }] }, "his waiting drafts: never a discarded one");
  assert.deepEqual(order, [`check after ${count + 1} calls`], "the caller's check runs once, after the count and before the first draft");
  // Made last first, so the first thing said is the newest row; each under its own place in the save.
  const made = calls.filter((c) => c.model === "task" && c.op === "create").map(dataOf);
  assert.deepEqual(made.map((d) => [d.title, d.autoKey]), [["Permit", "claude:u-pieter:b-1:2"], ["Faucet", "claude:u-pieter:b-1:1"], ["Gutters", "claude:u-pieter:b-1:0"]]);
  // Every "created" line keeps the save's fingerprint, beside who it was assigned to.
  const lines = calls.filter((c) => c.model === "taskEvent" && c.op === "create").map(dataOf);
  assert.deepEqual(lines.map((l) => l.data), [{ sent: draftsFingerprint(DRAFTS) }, { sent: draftsFingerprint(DRAFTS) }, { to: { userId: null, contactId: "c-zack" }, sent: draftsFingerprint(DRAFTS) }]);
  await rejects(saveDrafts(fakeTx().tx, "b-1", DRAFTS, ZACK, undefined, NOW), "Only a partner can save a draft.");
});

// The first build wrote a checklist item in five statements, so the largest save the connector allows (25 drafts of
// 20 items) was about 2,600 in one transaction. One insert a draft keeps it near 200.
test("the largest save the connector allows is about 200 statements, not five an item", async () => {
  const big: DraftInput[] = Array.from({ length: 25 }, (_, d) => ({
    title: `Draft ${d}`,
    assignee: { contactId: "c-zack" },
    checklist: Array.from({ length: 20 }, (_, i) => ({ title: `Step ${i}` })),
  }));
  const { tx, calls } = fakeTx({}, (model) => (model === "$queryRaw" ? [{ archived: false }] : undefined));
  assert.equal((await saveDrafts(tx, "b-big", big, PIETER, undefined, NOW)).kind, "saved");
  assert.ok(calls.length <= 200, `${calls.length} statements`);
  assert.equal(calls.filter((c) => c.model === "taskChecklistItem").length, 25, "one checklist statement a draft");
  assert.deepEqual([...new Set(calls.filter((c) => c.model === "taskChecklistItem").map((c) => c.op))], ["createMany"]);
});

/** A batch already under the key: two rows, whose "created" lines carry `sent` (or none). */
const savedBatch = (sent: string | null, waiting = 0): Answer => (model, op, args) => {
  if (model === "task" && op === "findMany" && (args.where?.autoKey as { startsWith?: string } | undefined)?.startsWith) {
    return [{ id: "t-b", autoKey: "claude:u-pieter:b-1:1", title: "Faucet" }, { id: "t-a", autoKey: "claude:u-pieter:b-1:0", title: "Gutters" }];
  }
  if (model === "taskEvent" && op === "findMany") return [{ data: sent ? { sent } : {} }, { data: sent ? { to: { userId: null, contactId: "c-zack" }, sent } : { to: { userId: null, contactId: "c-zack" } } }];
  if (model === "task" && op === "count") return waiting;
  return undefined;
};

test("the same batchKey again writes nothing: the same drafts are a replay, other drafts a key that was already used", async () => {
  let checked = 0;
  const check = async () => void checked++;
  const same = fakeTx({}, savedBatch(draftsFingerprint(DRAFTS)));
  const replay = await saveDrafts(same.tx, "b-1", DRAFTS, PIETER, check, NOW);
  assert.equal(replay.kind, "replay");
  assert.deepEqual(replay.kind === "replay" && replay.tasks.map((t) => t.id), ["t-a", "t-b"], "the tasks the first send made, in the save's order");
  assert.deepEqual(writes(same.calls), []);

  const other = fakeTx({}, savedBatch(draftsFingerprint([{ title: "Something else he said last week" }])));
  assert.deepEqual(await saveDrafts(other.tx, "b-1", DRAFTS, PIETER, check, NOW), { kind: "key-reused" });
  assert.deepEqual(writes(other.calls), []);

  // A batch saved before fingerprints were kept has none on its lines: it reads as the same save.
  const old = fakeTx({}, savedBatch(null));
  assert.equal((await saveDrafts(old.tx, "b-1", DRAFTS, PIETER, check, NOW)).kind, "replay");
  assert.deepEqual(writes(old.calls), []);
  assert.equal(checked, 0, "a send that changes nothing is never checked again, and never spends the caller's budget");
  // Neither answer counts his waiting drafts: a replay is one even when he is at the cap.
  for (const done of [same, other, old]) assert.ok(!done.calls.some((c) => c.model === "task" && c.op === "count"));
});

test("a save that would pass the cap on waiting drafts writes nothing and says how many wait", async () => {
  let checked = 0;
  const atCap = (waiting: number): Answer => (model, op) => (model === "task" && op === "count" ? waiting : undefined);
  const full = fakeTx({}, atCap(MAX_WAITING_DRAFTS - 2));
  assert.deepEqual(await saveDrafts(full.tx, "b-9", DRAFTS, PIETER, async () => void checked++, NOW), { kind: "too-many", waiting: MAX_WAITING_DRAFTS - 2 });
  assert.deepEqual(writes(full.calls), []);
  assert.equal(checked, 0, "refused before the caller's check, so it costs none of the save budget");
  // Exactly to the cap still saves.
  const fits = fakeTx({}, atCap(MAX_WAITING_DRAFTS - 3));
  assert.equal((await saveDrafts(fits.tx, "b-9", DRAFTS, PIETER, undefined, NOW)).kind, "saved");
});

test("only a partner saves a draft, under a key that can be stored, and Draft is never asked for as a status", async () => {
  const input = { title: "Fix gutters", draft: { batchKey: "b-1", index: 0 } };
  await rejects(createTask(fakeTx().tx, input, { kind: "system", label: "Move-in form" }, NOW), "Only a partner can save a draft.");
  await rejects(createTask(fakeTx().tx, input, ZACK, NOW), "Contractors can't create tasks yet.");
  for (const draft of [{ batchKey: "", index: 0 }, { batchKey: "b".repeat(101), index: 0 }, { batchKey: "b-1", index: -1 }, { batchKey: "b-1", index: 1.5 }]) {
    const { tx, calls } = fakeTx();
    await rejects(createTask(tx, { title: "Fix gutters", draft }, PIETER, NOW), "That save's key isn't valid.");
    assert.deepEqual(calls, [], "refused before anything is read");
  }
  const plain = fakeTx();
  await rejects(createTask(plain.tx, { title: "Fix gutters", status: "DRAFT" }, PIETER, NOW), "That status change isn't allowed.");
  assert.deepEqual(writes(plain.calls), []);
});

// ---------------------------------------------------------------------------
// While it is a draft: nobody is emailed, nobody sees the job
// ---------------------------------------------------------------------------

test("editing a draft's assignee, date and notes changes the draft and reaches no one", async () => {
  // From Zack to Rob: on a task this revokes Zack's access, grants Rob's, emails Rob and tells Zack he's off the job.
  const reassign = fakeTx();
  const after = await patchTask(reassign.tx, "t1", { assignee: { contactId: "c-rob" } }, PIETER, NOW);
  assert.equal(after.assigneeContactId, "c-rob");
  assert.equal(dataOf(find(reassign.calls, "taskEvent", "create")).kind, "ASSIGNED", "the draft's own timeline still records it");
  assert.ok(!reassign.calls.some(isAccess), "no access granted or revoked");
  assert.ok(!reassign.calls.some(isEmail), "no 'assigned you', no 'you're off this job'");
  assert.ok(!reassign.calls.some((c) => c.model === "portalAccount"));

  // The same contractor, a new date and new notes: on a task each of these emails him.
  const edit = fakeTx();
  await patchTask(edit.tx, "t1", { dueDate: "2026-11-27", description: "Bring the tall ladder." }, PIETER, NOW);
  assert.deepEqual(writes(edit.calls).map((c) => `${c.model}.${c.op}`), ["task.update", "taskEvent.create", "taskEvent.create"]);
  assert.ok(!edit.calls.some(isEmail) && !edit.calls.some(isAccess));

  // The same edits on a task do reach him, so the fake would show it.
  const live = fakeTx({ status: "OPEN" });
  await patchTask(live.tx, "t1", { dueDate: "2026-11-27", description: "Bring the tall ladder." }, PIETER, NOW);
  assert.equal(live.calls.filter(isEmail).length, 2);
});

test("a comment and a file on a draft email no one, and are addressed to nobody in particular (D21)", async () => {
  const comment = fakeTx();
  await addComment(comment.tx, "t1", { body: "Photos to follow.", visibility: "SHARED" }, PIETER, NOW);
  const said = dataOf(find(comment.calls, "taskEvent", "create"));
  assert.deepEqual([said.kind, said.visibility, said.audienceContactId], ["COMMENT", "SHARED", null]);
  assert.ok(!comment.calls.some(isEmail));

  const file = fakeTx();
  await recordAttachment(file.tx, "t1", { url: "https://blob.example.test/a.jpg", pathname: "tasks/a.jpg", filename: "a.jpg", size: 10, contentType: "image/jpeg" }, PIETER, { visibility: "SHARED" }, NOW);
  assert.equal(dataOf(find(file.calls, "taskAttachment", "create")).audienceContactId, null);
  assert.equal(dataOf(find(file.calls, "taskEvent", "create")).audienceContactId, null);
  assert.ok(!file.calls.some(isEmail));

  // On a task the same comment is Zack's, and is emailed to him.
  const live = fakeTx({ status: "OPEN" });
  await addComment(live.tx, "t1", { body: "Photos to follow.", visibility: "SHARED" }, PIETER, NOW);
  assert.equal(dataOf(find(live.calls, "taskEvent", "create")).audienceContactId, "c-zack");
  assert.equal(live.calls.filter(isEmail).length, 1);
});

test("no status change reaches a draft or makes one, and nothing is written", async () => {
  for (const to of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED"] as const) {
    const { tx, calls } = fakeTx();
    await rejects(setStatus(tx, "t1", to, PIETER, { waitingOn: "the city", scheduledFor: "2026-11-27" }, NOW), "That status change isn't allowed.");
    assert.deepEqual(writes(calls), [], to);
  }
  const live = fakeTx({ status: "OPEN" });
  await rejects(setStatus(live.tx, "t1", "DRAFT", PIETER, {}, NOW), "That status change isn't allowed.");
  assert.deepEqual(writes(live.calls), []);
});

test("a contractor can't open or write a draft even with an access row, and the 8 am reminder passes it over", async () => {
  const withRow = (status: string): Answer => (model, op) =>
    model === "taskAccess" && op === "findUnique" ? { revokedAt: null, task: { status }, contact: { active: true, portalAccount: { status: "ACTIVE" } } } : undefined;
  await rejects(assertContractorAccess(fakeTx({}, withRow("DRAFT")).tx, "t1", { contactId: "c-zack" }), "You don't have access to this job.");
  await assertContractorAccess(fakeTx({}, withRow("OPEN")).tx, "t1", { contactId: "c-zack" });
  const post = fakeTx({}, withRow("DRAFT"));
  await rejects(addComment(post.tx, "t1", { body: "On my way." }, ZACK, NOW), "You don't have access to this job.");
  assert.deepEqual(writes(post.calls), []);

  const draft = fakeTx();
  assert.equal(await queueDueReminder(draft.tx, { id: "t1", assigneeContactId: "c-zack" }, "DUE_TODAY", "2026-11-20", NOW), false);
  assert.ok(!draft.calls.some(isEmail));
  assert.deepEqual(named(draft.calls), ["task.findUnique"], "the status is read first, and nothing after it");
  const live = fakeTx({ status: "OPEN" });
  assert.equal(await queueDueReminder(live.tx, { id: "t1", assigneeContactId: "c-zack" }, "DUE_TODAY", "2026-11-20", NOW), true);
});

// ---------------------------------------------------------------------------
// Add, and its Undo
// ---------------------------------------------------------------------------

test("Add: the task, then its contractor's contact, then To do, the line, the access and the email", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => (model === "$queryRaw" && op.includes('FROM "Contact"') ? [{ archived: false }] : undefined));
  const added = await addDraft(tx, "t1", PIETER, NOW);
  assert.equal(added.task.status, "OPEN");
  assert.deepEqual(added.contractor, { contactId: "c-zack", firstName: "Zack", fullName: "Zack Reading", getsEmail: true });
  const at = (needle: string) => calls.findIndex((c) => (c.model.startsWith("$") ? c.op.includes(needle) : `${c.model}.${c.op}` === needle));
  assert.equal(at('SELECT 1 FROM "Task"'), 0, "the task row first");
  assert.ok(calls[0].op.includes("FOR NO KEY UPDATE"));
  assert.ok(at('FROM "Contact"') > 0 && at('FROM "Contact"') < at("task.update"), "the contact is locked before anything is written");
  assert.ok(calls[at('FROM "Contact"')].op.includes("FOR SHARE"));
  assert.ok(at("task.update") < at("taskEvent.create") && at("taskEvent.create") < at("taskAccess.upsert") && at("taskAccess.upsert") < at("INSERT INTO"), "status, line, access, email");
  assert.deepEqual(dataOf(find(calls, "task", "update")).status, "OPEN");
  const line = dataOf(find(calls, "taskEvent", "create"));
  assert.deepEqual([line.kind, line.visibility, line.source, line.data], ["STATUS", "INTERNAL", "APP", { from: "DRAFT", to: "OPEN" }]);
  assert.match(added.addEventId, /^ev-\d+$/, "the line's id comes back for the Undo");
  assert.equal(calls.filter(isEmail).length, 1);
  const email = calls.find(isEmail)!.args as unknown[];
  assert.match(String(email.find((v) => typeof v === "string" && v.includes('"kind"'))), /"kind":"ASSIGNED"/);
});

test("Add refuses a contractor archived since the draft was saved, in the house's own line, before anything is written", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => (model === "$queryRaw" && op.includes('FROM "Contact"') ? [{ archived: true }] : undefined));
  await assert.rejects(
    addDraft(tx, "t1", PIETER, NOW),
    (err: unknown) => err instanceof DraftRefusedError && err.message === ARCHIVED_ASSIGNEE_LINE && err.taskId === "t1" && err.title === "Fix gutters pulling off the back",
  );
  assert.equal(ARCHIVED_ASSIGNEE_LINE, "Archived. Pick someone else.");
  assert.deepEqual(writes(calls), []);
});

test("Add refuses a draft whose unit is no longer on its building, and names the unit as the pickers do", async () => {
  const building = (units: unknown): Answer => (model, op) => (model === "property" && op === "findUnique" ? { units } : undefined);
  const refusedWith = async (row: Record<string, unknown>, units: unknown) => {
    const { tx, calls } = fakeTx(row, building(units));
    let line: string | null = null;
    await addDraft(tx, "t1", PIETER, NOW).catch((err: unknown) => {
      if (!(err instanceof DraftRefusedError) || err.taskId !== "t1") throw err;
      line = err.message;
    });
    if (line !== null) assert.deepEqual(writes(calls), [], "refused before anything is written");
    return line;
  };
  const DUPLEX = [{ id: "u1", label: "1" }, { id: "u2", label: "Rear " }];
  // Removed since the save: a bare number reads "Unit 2", a written label as written.
  assert.equal(await refusedWith({ propertyId: "p1", unitLabel: "2" }, DUPLEX), "Unit 2 is gone. Pick the unit.");
  assert.equal(await refusedWith({ propertyId: "p1", unitLabel: "Upper" }, DUPLEX), "Upper is gone. Pick the unit.");
  assert.equal(await refusedWith({ propertyId: "p1", unitLabel: "1" }, []), "Unit 1 is gone. Pick the unit.", "the building has no units any more");
  // Still there, matched as the lockbox code is: trimmed, whatever the case.
  assert.equal(await refusedWith({ propertyId: "p1", unitLabel: "1" }, DUPLEX), null);
  assert.equal(await refusedWith({ propertyId: "p1", unitLabel: " rear" }, DUPLEX), null);
  // No unit named, or no building: nothing to check, and the building isn't read.
  for (const row of [{ propertyId: "p1", unitLabel: null }, { propertyId: null, unitLabel: "2" }]) {
    const { tx, calls } = fakeTx(row);
    await addDraft(tx, "t1", PIETER, NOW);
    assert.ok(!calls.some((c) => c.model === "property"));
  }
  // Add all stops on it too, and says which draft.
  const all = fakeTx({ propertyId: "p1", unitLabel: "2" }, (model, op, args) => (model === "$queryRaw" && op.includes('FROM "Task"') ? [{ id: "t1" }] : building(DUPLEX)(model, op, args)));
  await assert.rejects(addDrafts(all.tx, ["t1"], PIETER, NOW), (err: unknown) => err instanceof DraftRefusedError && err.message === "Unit 2 is gone. Pick the unit.");
});

test("Add addresses what was posted as Shared on the draft to its contractor, and its Undo puts exactly those back", async () => {
  const posted: Answer = (model, op, args) => {
    if (model === "taskEvent" && op === "findMany" && args.where?.visibility === "SHARED") return [{ id: "ev-comment" }, { id: "ev-file" }];
    if (model === "taskAttachment" && op === "findMany" && args.where?.visibility === "SHARED") return [{ id: "att-1" }];
    return model === "$queryRaw" ? [{ archived: false }] : undefined;
  };
  const { tx, calls } = fakeTx({}, posted);
  await addDraft(tx, "t1", PIETER, NOW);
  // Staff rows that are Shared and addressed to nobody: never a contractor's, never an imported one.
  assert.deepEqual((calls.find((c) => c.model === "taskEvent" && c.op === "findMany")!.args as Args).where, {
    taskId: "t1",
    visibility: "SHARED",
    audienceContactId: null,
    actorContactId: null,
    source: { not: "ASANA" },
  });
  assert.deepEqual((calls.find((c) => c.model === "taskAttachment" && c.op === "findMany")!.args as Args).where, { taskId: "t1", visibility: "SHARED", audienceContactId: null, uploadedByContactId: null, asanaGid: null });
  const readdressed = (all: Call[]) => all.filter((c) => c.op === "updateMany" && (c.model === "taskEvent" || c.model === "taskAttachment")).map((c) => [c.model, (c.args as Args).where, (c.args as Args).data]);
  assert.deepEqual(readdressed(calls), [
    ["taskEvent", { id: { in: ["ev-comment", "ev-file"] } }, { audienceContactId: "c-zack" }],
    ["taskAttachment", { id: { in: ["att-1"] } }, { audienceContactId: "c-zack" }],
  ]);
  // The Add's line keeps which rows it addressed, and to whom.
  const add = calls.filter((c) => c.model === "taskEvent" && c.op === "create").map(dataOf).find((d) => d.kind === "STATUS")!;
  assert.deepEqual(add.data, { from: "DRAFT", to: "OPEN", addressed: { to: "c-zack", events: ["ev-comment", "ev-file"], files: ["att-1"] } });

  // A partner's own draft has nobody to address them to: nothing is read or changed, and the line says nothing of it.
  const own = fakeTx({ assigneeContactId: null, assigneeUserId: "u-pieter" }, posted);
  await addDraft(own.tx, "t1", PIETER, NOW);
  assert.deepEqual(readdressed(own.calls), []);
  assert.deepEqual(own.calls.filter((c) => c.model === "taskEvent" && c.op === "create").map(dataOf)[0].data, { from: "DRAFT", to: "OPEN" });

  // The Undo reads them off the line and puts back those rows, only while they are still addressed to that contractor.
  const line = { id: "ev-add", data: add.data, createdAt: new Date(NOW.getTime() - 30_000), actorUserId: "u-pieter", actorLabel: "Pieter Louw" };
  const undo = fakeTx({ status: "OPEN" }, (model, op, args) => {
    if (model !== "taskEvent" || op !== "findFirst") return undefined;
    if ((args.where?.deletedAt as { not?: unknown } | undefined)?.not === null) return null;
    return args.where?.kind === "STATUS" ? line : null;
  });
  await undoAddDraft(undo.tx, "t1", "ev-add", PIETER, NOW);
  // Exactly those, and nothing else: what a partner posted as Shared AFTER the Add stays addressed to the contractor
  // the job had then, so a note written for them is never shown to whoever the draft is added for next.
  assert.deepEqual(readdressed(undo.calls), [
    ["taskEvent", { id: { in: ["ev-comment", "ev-file"] }, taskId: "t1", audienceContactId: "c-zack" }, { audienceContactId: null }],
    ["taskAttachment", { id: { in: ["att-1"] }, taskId: "t1", audienceContactId: "c-zack" }, { audienceContactId: null }],
  ]);
  // A partner's own task has no contractor a post could have been addressed to: nothing more is touched.
  const ownUndo = fakeTx({ status: "OPEN", assigneeContactId: null, assigneeUserId: "u-pieter" }, addLine());
  await undoAddDraft(ownUndo.tx, "t1", "ev-add", PIETER, NOW);
  assert.deepEqual(readdressed(ownUndo.calls), []);
});

test("Add is for a partner and a draft: a task already added says who added it, and nothing is written", async () => {
  await rejects(addDraft(fakeTx().tx, "t1", ZACK, NOW), "Only a partner can do that with a draft.");
  const gone = fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await rejects(addDraft(gone.tx, "t1", PIETER, NOW), "That draft no longer exists.");
  // A discarded draft is gone to everyone, Add included: the same line, and nothing written.
  const discarded = fakeTx({ discardedAt: new Date(NOW.getTime() - 5_000) });
  await rejects(addDraft(discarded.tx, "t1", PIETER, NOW), "That draft no longer exists.");
  assert.deepEqual(writes(discarded.calls), []);
  // Add all passes it over, as it does one already added: it is where it was headed.
  const passed = fakeTx({ discardedAt: new Date(NOW.getTime() - 5_000) }, (model, op) => (model === "$queryRaw" && op.includes('FROM "Task"') ? [{ id: "t1" }] : undefined));
  assert.deepEqual(await addDrafts(passed.tx, ["t1"], PIETER, NOW), []);
  assert.deepEqual(writes(passed.calls), []);
  const added = fakeTx({ status: "OPEN" }, (model, op) => (model === "taskEvent" && op === "findFirst" ? { actorLabel: "Connor Swofford", actorUserId: "u-connor" } : undefined));
  await assert.rejects(addDraft(added.tx, "t1", PIETER, NOW), (err: unknown) => err instanceof TaskChangedError && err.message === "Connor moved this to To do.");
  assert.deepEqual(writes(added.calls), []);
  // A partner's own draft: no contact to lock, no access, no email, and nothing more to say.
  const own = fakeTx({ assigneeContactId: null, assigneeUserId: "u-pieter" });
  assert.equal((await addDraft(own.tx, "t1", PIETER, NOW)).contractor, null);
  assert.ok(!own.calls.some(isAccess) && !own.calls.some(isEmail) && !own.calls.some((c) => c.op.includes('FROM "Contact"')));
});

/** The Add's own line as the latest status line, written `agoMs` before NOW by Pieter. */
const addLine = (agoMs = 30_000, by = "u-pieter"): Answer => (model, op, args) => {
  if (model !== "taskEvent" || op !== "findFirst") return undefined;
  if ((args.where?.deletedAt as { not?: unknown } | undefined)?.not === null) return null;
  return { id: "ev-add", data: { from: "DRAFT", to: "OPEN" }, createdAt: new Date(NOW.getTime() - agoMs), actorUserId: by, actorLabel: by === "u-pieter" ? "Pieter Louw" : "Connor Swofford" };
};

test("Undo: a draft again, the Add's line hidden, the access row gone, and the emails the Add queued deleted", async () => {
  const { tx, calls } = fakeTx({ status: "OPEN" }, addLine());
  const { task } = await undoAddDraft(tx, "t1", "ev-add", PIETER, NOW);
  assert.equal(task.status, "DRAFT");
  assert.deepEqual(
    writes(calls).map((c) => `${c.model}.${c.op}`),
    ["task.update", "taskEvent.update", "taskAccess.deleteMany", "notificationOutbox.deleteMany"],
  );
  assert.deepEqual((find(calls, "taskEvent", "update")!.args as Args).data, { deletedAt: NOW });
  // Only the access an assignment made: one someone shared by hand is not the Undo's to take.
  assert.deepEqual((find(calls, "taskAccess", "deleteMany")!.args as Args).where, { taskId: "t1", source: "ASSIGNEE" });
  // Every contractor's row for this job that is unsent with no try against it: the ones still waiting, and one a
  // send run claimed and handed back untried (its `openKey` already cleared), which would otherwise send beside the
  // next Add's row. Nothing here asks for `openKey`.
  assert.deepEqual((find(calls, "notificationOutbox", "deleteMany")!.args as Args).where, { taskId: "t1", recipientContactId: { not: null }, sentAt: null, attempts: 0 });
  // The email rows are locked, in id order, before anything is written.
  const rows = calls.findIndex((c) => c.model === "$queryRaw" && c.op.includes('FROM "NotificationOutbox"'));
  assert.ok(rows > 0 && rows < calls.findIndex((c) => c.model === "task" && c.op === "update"));
  assert.match(calls[rows].op, /ORDER BY "id" FOR UPDATE/);
  // Whether a contractor is on the job is asked under the task's lock, before the email rows are taken.
  const touched = calls.findIndex((c) => c.model === "taskReadState");
  assert.ok(touched > 0 && touched < rows);
});

test("Undo is refused once it's late, another partner's, moved on, or its email is sent or on its way, in lines of its own", async () => {
  const late = fakeTx({ status: "OPEN" }, addLine(APPROVAL_UNDO_MS + 1_000));
  await rejects(undoAddDraft(late.tx, "t1", "ev-add", PIETER, NOW), "Too late to undo.");
  const theirs = fakeTx({ status: "OPEN" }, addLine(30_000, "u-pieter"));
  await rejects(undoAddDraft(theirs.tx, "t1", "ev-add", CONNOR, NOW), "Only Pieter can undo this.");
  const other = fakeTx({ status: "OPEN" }, addLine());
  await rejects(undoAddDraft(other.tx, "t1", "ev-earlier", PIETER, NOW), "This task changed since.");
  const moved = fakeTx({ status: "IN_PROGRESS" }, addLine());
  await assert.rejects(undoAddDraft(moved.tx, "t1", "ev-add", PIETER, NOW), (err: unknown) => err instanceof TaskChangedError && err.current === "IN_PROGRESS");
  const email = (row: Record<string, unknown>): Answer => (model, op, args) => (model === "$queryRaw" && op.includes('FROM "NotificationOutbox"') ? [row] : addLine()(model, op, args));
  const sent = fakeTx({ status: "OPEN" }, email({ sentAt: NOW, lastError: null, openKey: null, attempts: 1 }));
  await rejects(undoAddDraft(sent.tx, "t1", "ev-add", PIETER, NOW), "Email already sent.");
  const claimed = fakeTx({ status: "OPEN" }, email({ sentAt: null, lastError: null, openKey: null, attempts: 1 }));
  await rejects(undoAddDraft(claimed.tx, "t1", "ev-add", PIETER, NOW), "The email is on its way.");
  for (const refused of [late, theirs, other, moved, sent, claimed]) assert.deepEqual(writes(refused.calls), []);
  // Still waiting, or closed without sending: neither reached anyone, so neither stops it.
  for (const row of [{ sentAt: null, lastError: null, openKey: "c:c-zack:t1", attempts: 0 }, { sentAt: NOW, lastError: "no access", openKey: null, attempts: 0 }]) {
    assert.equal((await undoAddDraft(fakeTx({ status: "OPEN" }, email(row)).tx, "t1", "ev-add", PIETER, NOW)).task.status, "DRAFT");
  }
});

test("Undo is refused once the contractor has opened or written on the job: a line, a file or a read mark of theirs", async () => {
  const withTrace = (trace: "line" | "file" | "read"): Answer => (model, op, args) => {
    if (trace === "line" && model === "taskEvent" && op === "findFirst" && (args.where?.actorContactId as { not?: unknown } | undefined)?.not === null) return { actorContactId: "c-zack" };
    if (trace === "file" && model === "taskAttachment" && op === "findFirst") return { uploadedByContactId: "c-zack" };
    if (trace === "read" && model === "taskReadState" && op === "findFirst") return { contactId: "c-zack" };
    return addLine()(model, op, args);
  };
  for (const trace of ["line", "file", "read"] as const) {
    const { tx, calls } = fakeTx({ status: "OPEN" }, withTrace(trace));
    await rejects(undoAddDraft(tx, "t1", "ev-add", PIETER, NOW), "Zack already opened it.");
    assert.deepEqual(writes(calls), [], trace);
    assert.ok(!calls.some((c) => c.model === "$queryRaw" && c.op.includes('FROM "NotificationOutbox"')), "refused before the email rows are taken");
  }
  // What counts: anything of a contractor's on the job, and a contractor's read mark, never a partner's own.
  const { tx, calls } = fakeTx({ status: "OPEN" }, addLine());
  await undoAddDraft(tx, "t1", "ev-add", PIETER, NOW);
  const asked = (model: string) => (calls.find((c) => c.model === model && c.op === "findFirst" && !(c.args as Args).where?.kind)!.args as Args).where;
  assert.deepEqual(asked("taskEvent"), { taskId: "t1", actorContactId: { not: null } });
  assert.deepEqual(asked("taskAttachment"), { taskId: "t1", uploadedByContactId: { not: null } });
  assert.deepEqual(asked("taskReadState"), { taskId: "t1", contactId: { not: null } });
});

test("a refusal names its person by first name while that is one person, and in full once two share it", async () => {
  // Another Zack among the contractors the pickers list: "Zack" alone could be either.
  const twoZacks: Answer = (model, op, args) => {
    if (model === "taskReadState" && op === "findFirst") return { contactId: "c-zack" };
    if (model === "contact" && op === "findMany") return [{ id: "c-zack", fullName: "Zack Reading" }, { id: "c-zack2", fullName: "Zack Outlaw" }];
    if (model === "user" && op === "findMany") return [{ id: "u-pieter", name: "Pieter Louw", email: "p@example.test" }, { id: "u-connor", name: "Connor Swofford", email: "c@example.test" }];
    return addLine()(model, op, args);
  };
  await rejects(undoAddDraft(fakeTx({ status: "OPEN" }, twoZacks).tx, "t1", "ev-add", PIETER, NOW), "Zack Reading already opened it.");
  // The people are read only once a refusal is certain: an Undo that goes through never asks.
  const fine = fakeTx({ status: "OPEN" }, addLine());
  await undoAddDraft(fine.tx, "t1", "ev-add", PIETER, NOW);
  assert.ok(!fine.calls.some((c) => (c.model === "user" || c.model === "contact") && c.op === "findMany"));
  // A contractor who shares the adding partner's first name: the partner is named in full.
  const twoPieters: Answer = (model, op, args) => {
    if (model === "contact" && op === "findMany") return [{ id: "c-p", fullName: "Pieter Novak" }];
    if (model === "user" && op === "findMany") return [{ id: "u-pieter", name: "Pieter Louw", email: "p@example.test" }];
    return addLine()(model, op, args);
  };
  await rejects(undoAddDraft(fakeTx({ status: "OPEN" }, twoPieters).tx, "t1", "ev-add", CONNOR, NOW), "Only Pieter Louw can undo this.");
});

test("Add all's Undo takes each task back or keeps it on its own, each inside its own savepoint", async () => {
  // t-a goes back; t-b was moved on by the other partner; t-c is gone.
  const rows = [{ id: "t-a", title: "Gutters" }, { id: "t-b", title: "Faucet" }];
  const { tx, calls } = fakeTx({}, (model, op, args) => {
    if (model === "$queryRaw" && op.includes('SELECT "id", "title" FROM "Task"')) return rows;
    if (model === "task" && op === "findUnique") {
      const id = args.where?.id;
      return id === "t-a" ? { id, title: "Gutters", status: "OPEN", dealId: null } : id === "t-b" ? { id, title: "Faucet", status: "IN_PROGRESS", dealId: null } : null;
    }
    if (model === "task" && op === "update") return { id: args.where?.id, status: args.data?.status, dealId: null };
    if (model === "taskEvent" && op === "findFirst") {
      if ((args.where?.deletedAt as { not?: unknown } | undefined)?.not === null) return null;
      if ((args.where?.data as { path?: unknown } | undefined)?.path) return { actorLabel: "Connor Swofford", actorUserId: "u-connor", actorContactId: null };
      return args.where?.kind === "STATUS" ? { id: "ev-a", data: { from: "DRAFT", to: "OPEN" }, createdAt: new Date(NOW.getTime() - 30_000), actorUserId: "u-pieter", actorLabel: "Pieter Louw" } : null;
    }
    return undefined;
  });
  const adds = [{ taskId: "t-c", addEventId: "ev-c" }, { taskId: "t-b", addEventId: "ev-b" }, { taskId: "t-a", addEventId: "ev-a" }];
  const out = await undoAddDrafts(tx, adds, PIETER, NOW);
  assert.deepEqual(out.undone.map((t) => t.id), ["t-a"]);
  assert.deepEqual(out.kept, [
    { taskId: "t-b", title: "Faucet", message: "Connor moved this to In progress." },
    { taskId: "t-c", title: "", message: "That task no longer exists." },
  ]);
  // Locked together first, in the database's id order, then one savepoint a task: released when it went back,
  // rolled back to when it was kept.
  assert.match(calls[0].op, /FROM "Task" WHERE "id" IN \(\?\) ORDER BY "id" FOR NO KEY UPDATE/);
  const points = calls.filter((c) => c.model === "$executeRaw" && /SAVEPOINT/.test(c.op)).map((c) => c.op.trim());
  assert.deepEqual(points, ["SAVEPOINT undo_add", "RELEASE SAVEPOINT undo_add", "SAVEPOINT undo_add", "ROLLBACK TO SAVEPOINT undo_add", "SAVEPOINT undo_add", "ROLLBACK TO SAVEPOINT undo_add"]);
  // Only the task that went back was written.
  assert.deepEqual(writes(calls).filter((c) => c.model === "task").map((c) => (c.args as Args).where), [{ id: "t-a" }]);
  // Anything that isn't a rule's refusal fails the whole Undo.
  const broken = fakeTx({ status: "OPEN" }, (model, op) => {
    if (model === "$queryRaw" && op.includes('SELECT "id", "title" FROM "Task"')) return [{ id: "t1", title: "Gutters" }];
    if (model === "taskEvent" && op === "findFirst") throw new Error("connection lost");
    return undefined;
  });
  await assert.rejects(undoAddDrafts(broken.tx, [{ taskId: "t1", addEventId: "ev-add" }], PIETER, NOW), /connection lost/);
  assert.deepEqual(await undoAddDrafts(fakeTx().tx, [], PIETER, NOW), { undone: [], kept: [] });
  await rejects(undoAddDrafts(fakeTx().tx, adds, ZACK, NOW), "Only a partner can do that with a draft.");
});

test("a retry of an Undo that went through is a quiet success", async () => {
  // The Add's line is already soft-deleted, and theirs.
  const { tx, calls } = fakeTx({ status: "DRAFT" }, (model, op, args) =>
    model === "taskEvent" && op === "findFirst" && (args.where?.deletedAt as { not?: unknown } | undefined)?.not === null ? { id: "ev-add" } : undefined,
  );
  assert.equal((await undoAddDraft(tx, "t1", "ev-add", PIETER, NOW)).task.status, "DRAFT");
  assert.deepEqual(writes(calls), []);
  // Added again since: the task is another Add's now, so the first Add's Undo, tapped late, is refused and not
  // answered as if it had made a draft.
  const readded = fakeTx({ status: "OPEN" }, (model, op, args) => {
    if (model !== "taskEvent" || op !== "findFirst") return undefined;
    if ((args.where?.deletedAt as { not?: unknown } | undefined)?.not === null) return { id: "ev-add" };
    return { id: "ev-add-2", data: { from: "DRAFT", to: "OPEN" }, createdAt: NOW, actorUserId: "u-pieter", actorLabel: "Pieter Louw" };
  });
  await rejects(undoAddDraft(readded.tx, "t1", "ev-add", PIETER, NOW), "This task changed since.");
  assert.deepEqual(writes(readded.calls), []);
});

// ---------------------------------------------------------------------------
// Discard, its Undo, the sweep
// ---------------------------------------------------------------------------

test("Discard marks a draft and deletes nothing; a task a partner has added is refused with who added it", async () => {
  const added = fakeTx({ status: "OPEN" }, (model, op) => (model === "taskEvent" && op === "findFirst" ? { actorLabel: "Pieter Louw", actorUserId: "u-pieter" } : undefined));
  await assert.rejects(discardDraft(added.tx, "t1", CONNOR, NOW), (err: unknown) => err instanceof TaskChangedError && err.message === "Pieter moved this to To do.");
  assert.deepEqual(writes(added.calls), []);
  await rejects(discardDraft(fakeTx().tx, "t1", ZACK, NOW), "Only a partner can do that with a draft.");
  // Already discarded, or deleted: gone, in the line a missing draft gets.
  await rejects(discardDraft(fakeTx({ discardedAt: NOW }).tx, "t1", CONNOR, NOW), "That draft no longer exists.");
  await rejects(discardDraft(fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined)).tx, "t1", CONNOR, NOW), "That draft no longer exists.");

  const draft = { id: "t1", propertyId: "p1", createdByUserId: "u-pieter" };
  const { tx, calls } = fakeTx({}, (model, op) => (model === "task" && op === "findMany" ? [draft] : undefined));
  const gone = await discardDraft(tx, "t1", CONNOR, NOW);
  assert.deepEqual(gone, { ids: ["t1"], propertyIds: ["p1"] });
  // The row is taken first, with the lock a task write takes; only a waiting draft is read; and it is marked, at `now`.
  assert.match(calls[0].op, /SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/);
  assert.deepEqual((find(calls, "task", "findMany")!.args as Args).where, { id: { in: ["t1"] }, status: "DRAFT", discardedAt: null });
  assert.deepEqual(writes(calls).map((c) => [`${c.model}.${c.op}`, (c.args as Args).where, (c.args as Args).data]), [["task.updateMany", { id: { in: ["t1"] } }, { discardedAt: NOW }]]);
  assert.ok(!calls.some((c) => /^delete/.test(c.op)), "nothing is deleted: not the row, not a comment, not a file");
});

test("Discard all marks only waiting drafts, and with `mine` only the partner's own", async () => {
  const rows = [
    { id: "t-mine", propertyId: "p1", createdByUserId: "u-pieter" },
    { id: "t-orphan", propertyId: null, createdByUserId: null },
    { id: "t-connors", propertyId: "p2", createdByUserId: "u-connor" },
  ];
  const { tx, calls } = fakeTx({}, (model, op) => (model === "task" && op === "findMany" ? rows : undefined));
  // t-added and t-gone aren't waiting drafts, so the read doesn't return them.
  const out = await discardDrafts(tx, ["t-orphan", "t-added", "t-connors", "t-mine", "t-gone", "t-mine"], PIETER, NOW, { mine: true });
  assert.deepEqual(out, { ids: ["t-orphan", "t-mine"], propertyIds: ["p1"] });
  assert.match(calls[0].op, /FROM "Task" WHERE "id" IN \(\?\) ORDER BY "id" FOR NO KEY UPDATE/);
  assert.deepEqual((find(calls, "task", "updateMany")!.args as Args).where, { id: { in: ["t-orphan", "t-mine"] } });
  // Without `mine` (one row's Discard on the other partner's draft), all three.
  const all = fakeTx({}, (model, op) => (model === "task" && op === "findMany" ? rows : undefined));
  assert.deepEqual((await discardDrafts(all.tx, ["t-mine", "t-orphan", "t-connors"], PIETER, NOW)).ids, ["t-mine", "t-orphan", "t-connors"]);
  // Nothing to discard writes nothing.
  const none = fakeTx();
  assert.deepEqual(await discardDrafts(none.tx, ["t-added"], PIETER, NOW), { ids: [], propertyIds: [] });
  assert.deepEqual(writes(none.calls), []);
  assert.deepEqual(await discardDrafts(fakeTx().tx, [], PIETER, NOW), { ids: [], propertyIds: [] });
});

test("Discard's Undo clears the mark by id and reads nothing else from the caller", async () => {
  const back = [{ id: "t-b" }, { id: "t-a" }];
  const { tx, calls } = fakeTx({}, (model, op) => (model === "task" && op === "findMany" ? back : undefined));
  const out = await restoreDrafts(tx, ["t-a", "t-swept", "t-b", "t-a"], CONNOR);
  assert.deepEqual(out.restored.map((t) => t.id), ["t-a", "t-b"], "in the order given");
  assert.deepEqual(out.gone, ["t-swept"]);
  assert.match(calls[0].op, /FROM "Task" WHERE "id" IN \(\?\) ORDER BY "id" FOR NO KEY UPDATE/);
  // The one write clears a discard and can do nothing else: a task, or a draft nobody discarded, is not matched.
  assert.deepEqual(writes(calls).map((c) => [`${c.model}.${c.op}`, (c.args as Args).where, (c.args as Args).data]), [
    ["task.updateMany", { id: { in: ["t-a", "t-swept", "t-b"] }, status: "DRAFT", discardedAt: { not: null } }, { discardedAt: null }],
  ]);
  // What is back is read as every draft read is: waiting drafts.
  assert.deepEqual((find(calls, "task", "findMany")!.args as Args).where, { id: { in: ["t-a", "t-swept", "t-b"] }, status: "DRAFT", discardedAt: null });
  await rejects(restoreDrafts(fakeTx().tx, ["t-a"], ZACK), "Only a partner can do that with a draft.");
  assert.deepEqual(await restoreDrafts(fakeTx().tx, [], CONNOR), { restored: [], gone: [] });
});

test("the sweep deletes drafts discarded long enough ago, under their locks, and hands back their files", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => {
    if (model === "$queryRaw") return [{ id: "t-old" }, { id: "t-older" }];
    if (model === "taskAttachment" && op === "findMany") return [{ url: "https://blob.example.test/a.jpg", thumbPathname: "thumbs/a.jpg", posterPathname: null }, { url: null, thumbPathname: null, posterPathname: null }];
    return undefined;
  });
  const swept = await sweepDiscardedDrafts(tx, NOW);
  assert.deepEqual(swept, { ids: ["t-old", "t-older"], blobs: ["https://blob.example.test/a.jpg", "thumbs/a.jpg"] });
  // Only drafts, only ones marked before the cutoff, locked as a delete locks them, never waiting on a row in use.
  assert.match(calls[0].op.replace(/\s+/g, " "), /SELECT "id" FROM "Task" WHERE "status" = 'DRAFT' AND "discardedAt" < \? ORDER BY "id" LIMIT \? FOR UPDATE SKIP LOCKED/);
  // The cutoff is `now` less the keep time, converted as every timestamp compared in raw SQL here is.
  const cutoff = (calls[0].args as unknown[])[0] as { strings: string[]; values: unknown[] };
  assert.deepEqual(cutoff.values, [new Date(NOW.getTime() - DISCARD_KEEP_MS).toISOString()]);
  assert.equal(cutoff.strings.join("?"), "(?::timestamptz AT TIME ZONE 'UTC')");
  assert.equal(DISCARD_KEEP_MS, 10 * 60_000);
  assert.deepEqual(named(calls).slice(1), ["taskAttachment.findMany", "task.deleteMany"], "the files are read before the rows go");
  assert.deepEqual((find(calls, "task", "deleteMany")!.args as Args).where, { id: { in: ["t-old", "t-older"] } });
  // Nothing due: nothing read past the first statement, nothing deleted.
  const quiet = fakeTx();
  assert.deepEqual(await sweepDiscardedDrafts(quiet.tx, NOW), { ids: [], blobs: [] });
  assert.equal(quiet.calls.length, 1);
});

// ---------------------------------------------------------------------------
// A discarded draft takes no write (6.1: it is gone to everyone at once)
// ---------------------------------------------------------------------------

const GONE = "That draft no longer exists.";
const SNAPSHOT: ChecklistSnapshot = { id: "i9", taskId: "t1", title: "Seal the corner", done: false, doneAt: null, doneByUserId: null, doneByContactId: null, assigneeLabel: null, dueDate: null, position: 2, asanaGid: null, createdAt: NOW.toISOString() };

/**
 * Every write a draft's page can send, each on task t1, with the rows it reads standing in: Pieter's own comment
 * ev-1, a posted file a1 and a checklist item i1, each naming whether its task was discarded, as the real reads do.
 */
const DRAFT_WRITES: [name: string, run: (tx: Tx) => Promise<unknown>][] = [
  ["an edit", (tx) => patchTask(tx, "t1", { title: "Fix the gutters today" }, PIETER, NOW)],
  ["a reassignment", (tx) => patchTask(tx, "t1", { assignee: { contactId: "c-rob" } }, PIETER, NOW)],
  ["a comment", (tx) => addComment(tx, "t1", { body: "Key under the mat.", visibility: "SHARED" }, PIETER, NOW)],
  ["a comment's edit", (tx) => editComment(tx, "ev-1", { body: "Key under the mat, front door." }, PIETER, NOW)],
  ["a comment's delete", (tx) => deleteComment(tx, "ev-1", PIETER, NOW)],
  ["a comment's restore", (tx) => restoreComment(tx, "ev-1", PIETER, NOW)],
  ["a file", (tx) => recordAttachment(tx, "t1", { url: "https://blob.example.test/a.jpg", pathname: "tasks/a.jpg", filename: "a.jpg", size: 10, contentType: "image/jpeg" }, PIETER, { visibility: "SHARED" }, NOW)],
  ["a file's removal", (tx) => removeAttachment(tx, { id: "a1", taskId: "t1", asanaGid: null }, PIETER, NOW)],
  ["a file's rename", (tx) => renameAttachment(tx, "a1", "Kitchen before.jpg", PIETER, NOW)],
  ["a checklist item", (tx) => addChecklistItem(tx, "t1", "Bring the tall ladder", PIETER, NOW)],
  ["a tick", (tx) => setChecklistItem(tx, "i1", true, PIETER, NOW)],
  ["an item's rename", (tx) => renameChecklistItem(tx, "i1", "Rehang both downspouts", PIETER, NOW)],
  ["an item's removal", (tx) => removeChecklistItem(tx, "i1", PIETER, NOW)],
  ["an item's restore", (tx) => restoreChecklistItem(tx, SNAPSHOT, PIETER, NOW)],
];

/**
 * The rows those writes read beside the task: each carries its task's mark, as core.ts selects it. `deletedComment`
 * is for the comment's restore, which only writes on a comment that was deleted.
 */
const draftRows = (discardedAt: Date | null, deletedComment = false): Answer => (model, op, args) => {
  const task = { id: "t1", status: "DRAFT", discardedAt };
  if (model === "taskEvent" && op === "findUnique") return { id: "ev-1", taskId: "t1", kind: "COMMENT", source: "APP", actorUserId: "u-pieter", actorContactId: null, body: "Key under the mat.", deletedAt: deletedComment ? NOW : null, visibility: "SHARED", audienceContactId: null, data: null, task };
  if (model === "taskAttachment" && op === "findUnique") return { taskId: "t1", eventId: "ev-1", filename: "IMG_2231.jpg", deletedAt: null, task };
  if (model === "taskChecklistItem" && op === "findUnique") return args.where?.id === "i1" ? { id: "i1", taskId: "t1", title: "Rehang the downspout", done: false, doneAt: null, doneByUserId: null, doneByContactId: null, assigneeLabel: null, dueDate: null, position: 0, asanaGid: null, createdAt: NOW, task } : null;
  if (model === "taskAttachment" && op === "deleteMany") return { count: 1 };
  return undefined;
};

test("a write sent to a discarded draft is refused in the line a missing draft gets, and nothing is written", async () => {
  const discardedAt = new Date(NOW.getTime() - 5_000);
  assert.equal(DRAFT_WRITES.length, 14);
  for (const [name, run] of DRAFT_WRITES) {
    const deleted = name === "a comment's restore";
    // On a waiting draft the same write goes through, so the stand-in would show it.
    const waiting = fakeTx({ discardedAt: null }, draftRows(null, deleted));
    await run(waiting.tx);
    assert.ok(writes(waiting.calls).length > 0, `${name} writes on a waiting draft`);
    // Discarded: refused, in the one line, before anything is written.
    const gone = fakeTx({ discardedAt }, draftRows(discardedAt, deleted));
    await rejects(run(gone.tx), GONE);
    assert.deepEqual(writes(gone.calls), [], name);
    assert.ok(!gone.calls.some(isEmail) && !gone.calls.some(isAccess), name);
  }
  // A status change was always refused on a draft; on a discarded one it says the draft is gone.
  const status = fakeTx({ discardedAt });
  await rejects(setStatus(status.tx, "t1", "OPEN", PIETER, {}, NOW), GONE);
  assert.deepEqual(writes(status.calls), []);
  // A row that isn't there keeps its own words: the mark is only read off a row that is.
  const missing = fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await rejects(patchTask(missing.tx, "t1", { title: "Fix the gutters today" }, PIETER, NOW), "That task no longer exists.");
  await rejects(addChecklistItem(missing.tx, "t1", "Bring the tall ladder", PIETER, NOW), "That task no longer exists.");
  await rejects(restoreChecklistItem(missing.tx, SNAPSHOT, PIETER, NOW), "This task is gone, so the item can't come back.");
});

test("a unit renamed on its building still carries a discarded draft, so its Undo brings back one Add takes", async () => {
  const discardedAt = new Date(NOW.getTime() - 5_000);
  const { tx, calls } = fakeTx({ discardedAt, propertyId: "p1", unitLabel: "2a" }, (model, op) => (model === "task" && op === "findMany" ? [{ id: "t1", unitLabel: "2a" }] : undefined));
  assert.deepEqual(await renameTaskUnits(tx, "p1", [{ from: "2a", to: "Unit 2A" }], PIETER, NOW), ["t1"]);
  assert.equal(dataOf(find(calls, "task", "update")).unitLabel, "Unit 2A");
  // Every task there that names the unit is read, whatever its status: no filter leaves a draft behind.
  assert.deepEqual(Object.keys((find(calls, "task", "findMany")!.args as Args).where ?? {}).sort(), ["OR", "propertyId"]);
});

// core.ts with its comments taken out, cut into its top-level functions.
const CORE = readFileSync(join(import.meta.dirname, "core.ts"), "utf8");
function coreFunctions(): Map<string, string> {
  const code = CORE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const starts = [...code.matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm)];
  return new Map(starts.map((m, i) => [m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length)]));
}

test("every function that takes one task's row for a write refuses a discarded draft, or is listed with why it need not", () => {
  // One task's row, taken by its id: the lock every by-id write starts with, in each form core.ts spells it.
  const takesRow = /FROM "Task" WHERE "id" = \$\{[^}]+\} FOR (NO KEY )?UPDATE|\block(Task|ChecklistItem)\(tx,|\bownComment\(tx,/;
  const taking = [...coreFunctions()].filter(([, body]) => takesRow.test(body)).map(([name]) => name).sort();
  // These refuse it (refuseDiscarded), directly or through the one read their three share.
  const REFUSES = [
    "setStatus",
    "writePatch",
    "addComment",
    "ownComment",
    "editComment",
    "deleteComment",
    "restoreComment",
    "recordAttachment",
    "removeAttachment",
    "renameAttachment",
    "setChecklistItem",
    "addChecklistItem",
    "renameChecklistItem",
    "removeChecklistItem",
    "restoreChecklistItem",
  ];
  // These decide for themselves, each for the reason beside it.
  const OWN_RULE: Record<string, string> = {
    lockTask: "the lock itself: it reads and writes nothing",
    lockChecklistItem: "the lock itself: each caller reads the item and its task after it",
    addDraft: "refuses a discarded draft in the same line",
    discardDraft: "refuses a discarded draft in the same line",
    undoAddDraft: "acts only on a To do task; on a draft it writes nothing",
    undoApproval: "acts only on a Done task",
    deleteTask: "answers for a discarded draft as for a missing task",
    takeBackRepeat: "takes the copy a finished task made, never a draft",
    setDateByContractor: "a contractor's write: their access check refuses any draft",
    addLateContractorBatch: "a contractor's write: their access check refuses any draft",
    takeBackContractorPost: "a contractor's write: their access check refuses any draft",
  };
  assert.deepEqual(taking, [...REFUSES, ...Object.keys(OWN_RULE)].sort(), "a function that takes a task's row is on one of the two lists");
  const fns = coreFunctions();
  for (const name of REFUSES) assert.match(fns.get(name) ?? "", /\brefuseDiscarded\(|\bawait ownComment\(tx,/, `${name} refuses a discarded draft`);
  for (const name of ["setDateByContractor", "addLateContractorBatch", "takeBackContractorPost"]) assert.match(fns.get(name) ?? "", /await assertContractorAccess\(tx, taskId, p\);/, name);
  // The line is the one a missing draft gets, and only a unit renamed on its building is carried onto a discarded draft.
  assert.match(fns.get("refuseDiscarded") ?? "", /if \(task && isDiscarded\(task\)\) throw new TaskRuleError\(DRAFT_GONE_LINE\);/);
  assert.match(fns.get("patchTask") ?? "", /return writePatch\(tx, taskId, patch, p, now, "refuse"\);/);
  assert.match(fns.get("writePatch") ?? "", /if \(discarded === "refuse"\) refuseDiscarded\(before\);/);
  assert.match(fns.get("renameTaskUnits") ?? "", /await writePatch\(tx, t\.id, \{ unitLabel: to \}, p, now, "carry"\);/);
  // Those two are the only callers, so no other write carries one.
  const callers = [...fns].filter(([name, body]) => name !== "writePatch" && /\bwritePatch\(/.test(body)).map(([name]) => name);
  assert.deepEqual(callers.sort(), ["patchTask", "renameTaskUnits"]);
});

// ---------------------------------------------------------------------------
// Delete is not for drafts
// ---------------------------------------------------------------------------

test("Delete refuses a draft under the row's lock; a task goes, and a discarded draft is already gone", async () => {
  const draft = fakeTx({ attachments: [] });
  await rejects(deleteTask(draft.tx, "t1", PIETER, NOW), "This is a draft. Discard it.");
  assert.equal(DRAFT_DELETE_LINE, "This is a draft. Discard it.");
  assert.deepEqual(writes(draft.calls), []);
  // The row is locked before its status is read, with the lock the delete takes.
  assert.match(draft.calls[0].op, /SELECT "id" FROM "Task" WHERE "id" = \? FOR UPDATE/);
  assert.equal(`${draft.calls[1].model}.${draft.calls[1].op}`, "task.findUnique");

  const task = fakeTx({ status: "OPEN", dealId: "d1", attachments: [{ url: "https://blob.example.test/a.jpg", thumbPathname: null, posterPathname: "posters/a.jpg" }] });
  assert.deepEqual(await deleteTask(task.tx, "t1", PIETER, NOW), { id: "t1", propertyId: null, dealId: "d1", blobs: ["https://blob.example.test/a.jpg", "posters/a.jpg"] });
  assert.deepEqual(writes(task.calls).map((c) => `${c.model}.${c.op}`), ["task.delete", "dealNote.create"]);

  // A discarded draft is gone to everyone: as a missing task, nothing written, no refusal.
  const discarded = fakeTx({ discardedAt: NOW, attachments: [] });
  assert.equal(await deleteTask(discarded.tx, "t1", PIETER, NOW), null);
  assert.deepEqual(writes(discarded.calls), []);
  assert.equal(await deleteTask(fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined)).tx, "t1", PIETER, NOW), null);
  await rejects(deleteTask(fakeTx().tx, "t1", ZACK, NOW), "Only staff can delete a task.");
});
