import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@prisma/client";
import { buildActivity, eventLine, type ActivityEvent } from "./activity";
import { ARCHIVED_ASSIGNEE_LINE, TaskRuleError, createNextRepeat, createTask, patchTask, setStatus, undoApproval, type Principal, type Tx } from "./core";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";

/**
 * N4 and N3(c) of the Nov 3 review: an open job never lands on an archived
 * contractor, and every path that hands one out locks the contractor's
 * Contact row (FOR SHARE) right after the Task row, so Archive (FOR UPDATE
 * on the Contact, archive.ts) runs wholly before or after it. On a fake
 * transaction that keeps every call in order, as core.test.ts does.
 */

const PIETER: Principal = { kind: "staff", userId: "u-pieter", label: "Pieter Louw" };
const NOW = new Date("2026-10-23T15:00:00Z");

type Call = { model: string; op: string; args: unknown };
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };
type Answer = (model: string, op: string, args: Args) => unknown;

/** Zack (c-zack) is archived; Jose (c-jose) isn't. `answer` overrides a call when it returns anything but undefined. */
function fakeTx(row: Record<string, unknown>, answer?: Answer) {
  const calls: Call[] = [];
  const archived = new Set(["c-zack"]);
  const stored = {
    id: "t1",
    title: "Hang drywall",
    description: null,
    status: "OPEN",
    dueDate: null,
    scheduledFor: null,
    propertyId: null,
    unitLabel: null,
    waitingOn: null,
    dealId: null,
    repeatRule: null,
    repeatSeriesId: null,
    assigneeUserId: null,
    assigneeContactId: null,
    assigneeName: null,
    assigneeEmail: null,
    ...row,
  };
  const result = (model: string, op: string, args: Args) => {
    const given = answer?.(model, op, args);
    if (given !== undefined) return given;
    if (model === "task" && op === "findUnique") return stored;
    if (model === "task" && (op === "update" || op === "create")) return { ...stored, id: op === "create" ? "t2" : stored.id, ...args.data };
    if (model === "contact" && op === "findUnique") {
      const id = args.where?.id as string;
      return { fullName: id === "c-zack" ? "Zack Outlaw" : "Jose Alvarez", archivedAt: archived.has(id) ? NOW : null };
    }
    if (model === "taskEvent" && op === "findFirst") return null;
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany") return { count: 0 };
    return { id: `${model}-${calls.length}` };
  };
  const raw = (model: "$executeRaw" | "$queryRaw") => async (sql: TemplateStringsArray, ...values: unknown[]) => {
    const op = sql.join("?");
    calls.push({ model, op, args: values });
    if (model === "$executeRaw") return 1;
    const given = answer?.(model, op, {});
    if (given !== undefined) return given;
    if (op.includes('FROM "Contact"') && op.includes("FOR SHARE")) return [{ archived: archived.has(values[0] as string) }];
    return [];
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

const isTaskLock = (c: Call) => c.model === "$executeRaw" && /FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/.test(c.op);
const isContactLock = (c: Call) => c.model === "$queryRaw" && /FROM "Contact" WHERE "id" = \? FOR SHARE/.test(c.op);
const isEmailRow = (c: Call) => (c.model === "$executeRaw" || c.model === "$queryRaw") && c.op.includes("NotificationOutbox");
const firstWrite = (calls: Call[]) => calls.findIndex((c) => /^(create|update|updateMany|upsert|delete|createMany)$/.test(c.op));
const events = (calls: Call[]) => calls.filter((c) => c.model === "taskEvent" && c.op === "create").map((c) => (c.args as { data: { kind: string; data: unknown } }).data);

test("the refusal is one line on a phone, with the next step", () => {
  assert.equal(ARCHIVED_ASSIGNEE_LINE, "Archived. Pick someone else.");
  assert.ok(ARCHIVED_ASSIGNEE_LINE.length <= TOAST_PHONE_CHARS);
});

test("createTask: a stale picker can't give a new job to an archived contractor; the lock comes before the insert", async () => {
  const refused = fakeTx({});
  await assert.rejects(createTask(refused.tx, { title: "Patch roof", assignee: { contactId: "c-zack" } }, PIETER, NOW), (e) => e instanceof TaskRuleError && e.message === ARCHIVED_ASSIGNEE_LINE);
  assert.equal(firstWrite(refused.calls), -1, "nothing written");

  const ok = fakeTx({});
  await createTask(ok.tx, { title: "Patch roof", assignee: { contactId: "c-jose" } }, PIETER, NOW);
  const lock = ok.calls.findIndex(isContactLock);
  assert.equal(lock, 0, "the contact is locked first");
  assert.deepEqual(ok.calls[lock].args, ["c-jose"]);
  assert.ok(lock < ok.calls.findIndex((c) => c.model === "task" && c.op === "create"));
  // No contractor, no lock.
  const none = fakeTx({});
  await createTask(none.tx, { title: "Patch roof", assignee: { userId: "u-pieter" } }, PIETER, NOW);
  assert.ok(!none.calls.some(isContactLock));
});

test("patchTask: reassigning to an archived contractor is refused; one who already has the job keeps it", async () => {
  const refused = fakeTx({ assigneeContactId: "c-jose" });
  await assert.rejects(patchTask(refused.tx, "t1", { assignee: { contactId: "c-zack" } }, PIETER, NOW), (e) => e instanceof TaskRuleError && e.message === ARCHIVED_ASSIGNEE_LINE);
  assert.equal(firstWrite(refused.calls), -1, "nothing written");

  // Already Zack's: saving the same pick (an editor that sends every field) is no reassignment.
  const kept = fakeTx({ assigneeContactId: "c-zack" });
  await patchTask(kept.tx, "t1", { assignee: { contactId: "c-zack" }, title: "Hang drywall upstairs" }, PIETER, NOW);
  assert.ok(!kept.calls.some(isContactLock));
  assert.ok(kept.calls.some((c) => c.model === "task" && c.op === "update"));

  // A live contractor: locked after the task, before the write, the access row and the email.
  const live = fakeTx({ assigneeContactId: null });
  await patchTask(live.tx, "t1", { assignee: { contactId: "c-jose" } }, PIETER, NOW);
  const order = [live.calls.findIndex(isTaskLock), live.calls.findIndex(isContactLock), firstWrite(live.calls)];
  assert.deepEqual([...order].sort((a, b) => a - b), order, `task lock, contact lock, then writes: ${order}`);
  assert.ok(order[0] >= 0 && order[1] > order[0]);
});

test("setStatus: a reopened job whose contractor is archived starts unassigned, with a line, and their access goes", async () => {
  const { tx, calls } = fakeTx({ status: "DONE", assigneeContactId: "c-zack" });
  const r = await setStatus(tx, "t1", "OPEN", PIETER, {}, NOW);
  assert.equal(r.task.assigneeContactId, null);
  assert.equal(r.emailsContractor, false, "nobody is emailed about a job they no longer have");
  const update = calls.find((c) => c.model === "task" && c.op === "update")!;
  assert.equal((update.args as { data: Record<string, unknown> }).data.assigneeContactId, null);
  const line = events(calls).find((e) => e.kind === "ASSIGNED");
  assert.deepEqual(line?.data, { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null }, archived: true });
  assert.ok(
    calls.some((c) => c.model === "taskAccess" && c.op === "updateMany" && (c.args as Args).where?.source === "ASSIGNEE"),
    "the automatic access row is revoked",
  );
  // Order: the task, then the contact, then any write; no email row comes before the contact lock.
  const order = [calls.findIndex(isTaskLock), calls.findIndex(isContactLock), firstWrite(calls)];
  assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `${order}`);
  const email = calls.findIndex(isEmailRow);
  assert.ok(email === -1 || email > order[1]);
});

test("setStatus: a reopened job keeps a contractor who isn't archived, and the contact is still locked", async () => {
  const { tx, calls } = fakeTx({ status: "DONE", assigneeContactId: "c-jose" });
  const r = await setStatus(tx, "t1", "OPEN", PIETER, {}, NOW);
  assert.equal(r.task.assigneeContactId, "c-jose");
  assert.ok(!events(calls).some((e) => e.kind === "ASSIGNED"));
  const lock = calls.findIndex(isContactLock);
  assert.ok(isTaskLock(calls[0]) && calls[lock - 1].model === "task" && calls[lock - 1].op === "findUnique", "right after the task's lock and read");
  assert.ok(lock < firstWrite(calls));
  // A plain move between open statuses takes no contact lock.
  const plain = fakeTx({ status: "OPEN", assigneeContactId: "c-jose" });
  await setStatus(plain.tx, "t1", "IN_PROGRESS", PIETER, {}, NOW);
  assert.ok(!plain.calls.some(isContactLock));
});

const finishedRepeat = (over: Record<string, unknown> = {}) =>
  ({
    id: "t1",
    title: "Furnace filter",
    description: null,
    status: "DONE",
    dueDate: new Date("2026-10-23T00:00:00Z"),
    propertyId: null,
    unitLabel: null,
    assigneeUserId: null,
    assigneeContactId: "c-zack",
    assigneeName: null,
    bucket: "General",
    repeatRule: { freq: "monthly", interval: 1 },
    repeatSeriesId: "s1",
    createdByUserId: null,
    ...over,
  }) as unknown as Task;

test("createNextRepeat: the copy of an archived contractor's job starts unassigned, and its CREATED line names them", async () => {
  const { tx, calls } = fakeTx({});
  const next = await createNextRepeat(tx, finishedRepeat(), PIETER, NOW);
  assert.equal(next, "t2");
  const made = calls.find((c) => c.model === "task" && c.op === "create")!;
  assert.equal((made.args as { data: Record<string, unknown> }).data.assigneeContactId, null);
  const created = events(calls).find((e) => e.kind === "CREATED")!;
  assert.deepEqual(created.data, { repeatOf: "t1", due: "2026-11-23", archivedAssignee: "c-zack" });
  assert.ok(!calls.some((c) => c.model === "taskAccess"), "no access row for anyone");
  assert.ok(!calls.some(isEmailRow), "no 'assigned you' email");
  // It reads archivedAt with a plain read and runs no raw SQL: the importer calls it too (asana/import.test.ts).
  assert.ok(!calls.some((c) => c.model.startsWith("$")));
});

test("createNextRepeat: a contractor who isn't archived gets the copy exactly as before", async () => {
  const { tx, calls } = fakeTx({});
  await createNextRepeat(tx, finishedRepeat({ assigneeContactId: "c-jose" }), PIETER, NOW);
  const made = calls.find((c) => c.model === "task" && c.op === "create")!;
  assert.equal((made.args as { data: Record<string, unknown> }).data.assigneeContactId, "c-jose");
  assert.deepEqual(events(calls).find((e) => e.kind === "CREATED")!.data, { repeatOf: "t1", due: "2026-11-23" });
  assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"));
});

test("setStatus: finishing a repeating job locks the contractor right after the task, before any email row", async () => {
  const { tx, calls } = fakeTx({ ...finishedRepeat({ status: "IN_PROGRESS" }) });
  const r = await setStatus(tx, "t1", "DONE", PIETER, {}, NOW);
  assert.equal(r.nextTaskId, "t2");
  const lock = calls.findIndex(isContactLock);
  assert.ok(isTaskLock(calls[0]) && calls[lock - 1].model === "task" && calls[lock - 1].op === "findUnique", "right after the task's lock and read");
  assert.ok(lock < firstWrite(calls));
  const copy = calls.find((c) => c.model === "task" && c.op === "create")!;
  assert.equal((copy.args as { data: Record<string, unknown> }).data.assigneeContactId, null, "the copy isn't Zack's");
  const email = calls.findIndex(isEmailRow);
  assert.ok(email === -1 || email > lock);
});

/* ---------------- Approve's Undo ---------------- */

const APPROVAL = { id: "s9", data: { from: "REVIEW", to: "DONE" }, createdAt: new Date("2026-10-23T14:59:30Z"), actorUserId: "u-pieter", actorLabel: "Pieter Louw" };
const undoAnswers: Answer = (model, op, args) => {
  const where = args.where ?? {};
  if (model === "taskEvent" && op === "findFirst" && where.kind === "STATUS" && where.deletedAt && typeof where.deletedAt === "object") return null;
  if (model === "taskEvent" && op === "findFirst" && where.kind === "STATUS") return APPROVAL;
  return undefined;
};

test("undoApproval: back in Review without a contractor archived since the approval, with a line; locks: task, contact, emails", async () => {
  const { tx, calls } = fakeTx({ status: "DONE", assigneeContactId: "c-zack" }, undoAnswers);
  const { task } = await undoApproval(tx, "t1", "s9", PIETER, NOW);
  assert.equal(task.status, "REVIEW");
  assert.equal(task.assigneeContactId, null);
  assert.deepEqual(events(calls).find((e) => e.kind === "ASSIGNED")?.data, {
    from: { userId: null, contactId: "c-zack", name: null },
    to: { userId: null, contactId: null },
    archived: true,
  });
  const emails = calls.findIndex((c) => c.model === "$queryRaw" && c.op.includes('FROM "NotificationOutbox"'));
  const order = [calls.findIndex(isTaskLock), calls.findIndex(isContactLock), emails, firstWrite(calls)];
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), `task, contact, email rows, then writes: ${order}`);

  const live = fakeTx({ status: "DONE", assigneeContactId: "c-jose" }, undoAnswers);
  const back = await undoApproval(live.tx, "t1", "s9", PIETER, NOW);
  assert.equal(back.task.assigneeContactId, "c-jose");
  assert.ok(!events(live.calls).some((e) => e.kind === "ASSIGNED"));
});

/* ---------------- How the timeline says it ---------------- */

function ev(kind: ActivityEvent["kind"], data: Record<string, unknown>, at: string, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `e-${at}`,
    kind,
    visibility: "INTERNAL",
    actorLabel: "Pieter Louw",
    actorUserId: "u-pieter",
    actorContactId: null,
    body: null,
    data,
    createdAt: new Date(at),
    source: "APP",
    ...over,
  };
}

test("the lines say who was archived, by name when the page has it", () => {
  const names = { contacts: { "c-zack": "Zack Outlaw" } };
  const unassigned = ev("ASSIGNED", { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null }, archived: true }, "2026-10-23T15:00:00Z");
  assert.equal(eventLine(unassigned, names, "2026-10-23").text, "Unassigned because Zack Outlaw is archived");
  assert.equal(eventLine(unassigned, {}, "2026-10-23").text, "Unassigned because the contractor is archived");
  const copy = ev("CREATED", { repeatOf: "t1", due: "2026-11-23", archivedAssignee: "c-zack" }, "2026-10-23T15:00:00Z", { actorUserId: null, actorLabel: "Repeats", source: "SYSTEM" });
  assert.deepEqual(eventLine(copy, names, "2026-10-23"), { text: "Created as the next repeat, unassigned because Zack Outlaw is archived", href: "/tasks/t1" });
});

test("the archived line is never paired away with the assignment it follows", () => {
  // Pieter gave Zack the job and reopened it a minute later after Zack was archived: both lines stay.
  const names = { contacts: { "c-zack": "Zack Outlaw" } };
  const assigned = ev("ASSIGNED", { from: { userId: null, contactId: null }, to: { userId: null, contactId: "c-zack" } }, "2026-10-23T14:59:00Z");
  const dropped = ev("ASSIGNED", { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null }, archived: true }, "2026-10-23T15:00:00Z");
  const texts = buildActivity([assigned, dropped], names, "2026-10-23").flatMap((e) => ("text" in e ? [e.text] : []));
  assert.ok(texts.some((t) => t === "Unassigned because Zack Outlaw is archived"), JSON.stringify(texts));
  assert.ok(texts.some((t) => /assigned Zack Outlaw/.test(t)), JSON.stringify(texts));
});

/* ---------------- A closed job can go back to them (Nov 3 low 4) ---------------- */

test("patchTask: an archived contractor's Done or Canceled job can go back to them, still locked task first", async () => {
  // Zack's Done job went to Jose and the reassignment's Undo brings it back, or a page loaded before he was archived
  // still lists him: either puts him back on his own record. Before, it was refused. (After a reopen's Undo or a
  // second Approve the job is his again without a pick: setStatus, below.)
  for (const status of ["DONE", "CANCELED"]) {
    const { tx, calls } = fakeTx({ status, assigneeContactId: null });
    const after = await patchTask(tx, "t1", { assignee: { contactId: "c-zack" }, expectedAssignee: null }, PIETER, NOW);
    assert.equal(after.assigneeContactId, "c-zack", status);
    const order = [calls.findIndex(isTaskLock), calls.findIndex(isContactLock), firstWrite(calls)];
    assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `task lock, contact lock, then writes: ${order}`);
    // He has no login (Archive needs it removed first), so nobody is emailed.
    assert.ok(!calls.some(isEmailRow), status);
  }
});

test("patchTask and createTask: every open status still refuses an archived contractor", async () => {
  for (const status of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"]) {
    const patch = fakeTx({ status, assigneeContactId: null });
    await assert.rejects(
      patchTask(patch.tx, "t1", { assignee: { contactId: "c-zack" } }, PIETER, NOW),
      (e) => e instanceof TaskRuleError && e.message === ARCHIVED_ASSIGNEE_LINE,
      status,
    );
    assert.equal(firstWrite(patch.calls), -1, `${status}: nothing written`);
  }
  const open = fakeTx({});
  await assert.rejects(createTask(open.tx, { title: "Patch roof", status: "WAITING", waitingOn: "Parts", assignee: { contactId: "c-zack" } }, PIETER, NOW), (e) => e instanceof TaskRuleError);
  // A task made closed (a record of work already done) can name them; the lock still comes before the insert.
  const done = fakeTx({});
  const made = await createTask(done.tx, { title: "Patched roof", status: "DONE", assignee: { contactId: "c-zack" } }, PIETER, NOW);
  assert.equal(made.assigneeContactId, "c-zack");
  assert.ok(done.calls.findIndex(isContactLock) < done.calls.findIndex((c) => c.model === "task" && c.op === "create"));
});

/* ---------------- Closing straight back gives the job back (Nov 3 low 4, the residual) ---------------- */

// The job's latest live ASSIGNED and STATUS lines, newest first, as setStatus reads them before a close.
const DROP = { kind: "ASSIGNED", data: { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null }, archived: true } };
const REOPEN = { kind: "STATUS", data: { from: "DONE", to: "OPEN" } };
const MARK_DONE = { kind: "STATUS", data: { from: "IN_PROGRESS", to: "REVIEW" } };
const isLinesRead = (model: string, op: string, args: Args) =>
  model === "taskEvent" && op === "findMany" && JSON.stringify(args.where?.kind) === JSON.stringify({ in: ["ASSIGNED", "STATUS"] });
const latestLines =
  (...rows: { kind: string; data: unknown }[]): Answer =>
  (model, op, args) =>
    isLinesRead(model, op, args) ? rows : undefined;

test("setStatus: the reopen's Undo gives an archived contractor's Done job back; locks: task, then his contact", async () => {
  // The case: Zack (archived) had the Done job, Pieter reopened it, which left it unassigned, then tapped Undo.
  const { tx, calls } = fakeTx({ status: "OPEN", assigneeContactId: null }, latestLines(REOPEN, DROP));
  const r = await setStatus(tx, "t1", "DONE", PIETER, { expected: "OPEN" }, NOW);
  assert.equal(r.task.assigneeContactId, "c-zack", "his closed job again, as before the reopen");
  const update = calls.find((c) => c.model === "task" && c.op === "update")!;
  assert.equal((update.args as { data: Record<string, unknown> }).data.assigneeContactId, "c-zack");
  assert.deepEqual(events(calls).find((e) => e.kind === "ASSIGNED")?.data, {
    from: { userId: null, contactId: null, name: null },
    to: { userId: null, contactId: "c-zack" },
  });
  assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"), "the automatic access row comes back with the job");
  assert.equal(r.emailsContractor, false, "he has no login (Archive needs it removed), so nobody is emailed");
  assert.ok(!calls.some(isEmailRow));
  const lock = calls.findIndex(isContactLock);
  assert.deepEqual(calls[lock].args, ["c-zack"]);
  const order = [calls.findIndex(isTaskLock), lock, firstWrite(calls)];
  assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `task lock, contact lock, then writes: ${order}`);
});

test("setStatus: a second Approve after Approve's Undo gives the job back too, and a Cancel straight after the reopen", async () => {
  // Approve's Undo writes no status line of its own (the Done line is soft-deleted): the drop is the latest line.
  const approve = fakeTx({ status: "REVIEW", assigneeContactId: null }, latestLines(DROP, MARK_DONE));
  assert.equal((await setStatus(approve.tx, "t1", "DONE", PIETER, { expected: "REVIEW" }, NOW)).task.assigneeContactId, "c-zack");
  const cancel = fakeTx({ status: "OPEN", assigneeContactId: null }, latestLines(REOPEN, DROP));
  assert.equal((await setStatus(cancel.tx, "t1", "CANCELED", PIETER, { expected: "OPEN" }, NOW)).task.assigneeContactId, "c-zack");
});

test("setStatus: no give-back once the job moved or was assigned since, for a contractor restored since, or onto open work", async () => {
  const jose = { ...DROP, data: { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } } };
  const unassigned = { kind: "ASSIGNED", data: { from: { userId: null, contactId: "c-jose" }, to: { userId: null, contactId: null } } };
  const cases: [string, { kind: string; data: unknown }[]][] = [
    ["moved since the reopen", [{ kind: "STATUS", data: { from: "OPEN", to: "IN_PROGRESS" } }, REOPEN, DROP]],
    ["assigned and unassigned since", [unassigned, REOPEN, DROP]],
    ["a reopen that dropped nobody", [REOPEN, unassigned]],
    ["sent back after Approve's Undo", [{ kind: "STATUS", data: { from: "REVIEW", to: "IN_PROGRESS" } }, DROP]],
    ["a contractor no longer archived (the picker offers him again)", [REOPEN, jose]],
  ];
  for (const [why, rows] of cases) {
    const { tx, calls } = fakeTx({ status: "OPEN", assigneeContactId: null }, latestLines(...rows));
    const r = await setStatus(tx, "t1", "DONE", PIETER, {}, NOW);
    assert.equal(r.task.assigneeContactId, null, why);
    assert.ok(!events(calls).some((e) => e.kind === "ASSIGNED"), why);
  }
  // Nothing is looked up for a job that has an assignee, or for a move that doesn't close it.
  for (const [row, to] of [
    [{ status: "OPEN", assigneeContactId: "c-jose" }, "DONE"],
    [{ status: "OPEN", assigneeUserId: "u-pieter" }, "DONE"],
    [{ status: "OPEN", assigneeContactId: null }, "IN_PROGRESS"],
  ] as const) {
    const { tx, calls } = fakeTx(row, latestLines(REOPEN, DROP));
    const r = await setStatus(tx, "t1", to, PIETER, {}, NOW);
    assert.ok(!calls.some((c) => isLinesRead(c.model, c.op, c.args as Args)), `${JSON.stringify(row)} to ${to}`);
    assert.notEqual(r.task.assigneeContactId, "c-zack");
  }
});
