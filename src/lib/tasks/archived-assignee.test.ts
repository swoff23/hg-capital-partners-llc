import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@prisma/client";
import { buildActivity, eventLine, type ActivityEvent } from "./activity";
import { ARCHIVED_ASSIGNEE_LINE, TaskRuleError, createNextRepeat, createTask, patchTask, setStatus, undoApproval, type Principal, type Tx } from "./core";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import { APPROVAL_UNDO_MS } from "./rules";

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

/** Zack (c-zack) is archived; Jose (c-jose) isn't, unless `archivedIds` says so. `answer` overrides a call when it returns anything but undefined. */
function fakeTx(row: Record<string, unknown>, answer?: Answer, archivedIds: readonly string[] = ["c-zack"]) {
  const calls: Call[] = [];
  const archived = new Set(archivedIds);
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
  // The reopen's own status line names who it dropped, so only its Undo gives the job back (below).
  assert.deepEqual(events(calls).find((e) => e.kind === "STATUS")?.data, { from: "DONE", to: "OPEN", dropped: "c-zack" });
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
  assert.deepEqual(events(calls).find((e) => e.kind === "STATUS")?.data, { from: "DONE", to: "OPEN" }, "no drop, no mark");
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

/* ---------------- Only an Undo gives the job back (Nov 3 low 4, the residual; the task session's ruling) ---------------- */

// The job's latest live ASSIGNED and STATUS lines, newest first, as setStatus reads them before a close. NOW is 15:00:00.
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const DROP = { kind: "ASSIGNED", data: { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null }, archived: true }, createdAt: ago(20_000) };
// A reopen that dropped Zack marks its status line with him (setStatus).
const REOPEN = { kind: "STATUS", data: { from: "DONE", to: "OPEN", dropped: "c-zack" }, createdAt: ago(20_000) };
const MARK_DONE = { kind: "STATUS", data: { from: "IN_PROGRESS", to: "REVIEW" }, createdAt: ago(60 * 60_000) };
const GIVEN_BACK = { from: { userId: null, contactId: null, name: null }, to: { userId: null, contactId: "c-zack" }, givenBack: true };
type Line = { kind: string; data: unknown; createdAt: Date };
const isLinesRead = (model: string, op: string, args: Args) =>
  model === "taskEvent" && op === "findMany" && JSON.stringify(args.where?.kind) === JSON.stringify({ in: ["ASSIGNED", "STATUS"] });
const latestLines =
  (...rows: Line[]): Answer =>
  (model, op, args) =>
    isLinesRead(model, op, args) ? rows : undefined;
/** A close of an unassigned job whose latest lines are `rows`: who has it after, and the ASSIGNED lines it wrote. */
async function close(status: string, to: "DONE" | "CANCELED", rows: Line[], now = NOW, archivedIds?: readonly string[]) {
  const { tx, calls } = fakeTx({ status, assigneeContactId: null }, latestLines(...rows), archivedIds);
  const r = await setStatus(tx, "t1", to, PIETER, { expected: status as never }, now);
  return { assignee: r.task.assigneeContactId, lines: events(calls).filter((e) => e.kind === "ASSIGNED"), calls, r };
}

test("setStatus: the reopen's Undo gives an archived contractor's Done job back, marked; locks: task, then his contact", async () => {
  // The case: Zack (archived) had the Done job, Pieter reopened it, which left it unassigned, then tapped Undo.
  const { assignee, lines, calls, r } = await close("OPEN", "DONE", [REOPEN, DROP]);
  assert.equal(assignee, "c-zack", "his closed job again, as before the reopen");
  const update = calls.find((c) => c.model === "task" && c.op === "update")!;
  assert.equal((update.args as { data: Record<string, unknown> }).data.assigneeContactId, "c-zack");
  assert.deepEqual(
    lines.map((e) => e.data),
    [GIVEN_BACK],
    "nobody picked him: the line says it was given back",
  );
  assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"), "the automatic access row comes back with the job");
  assert.equal(r.emailsContractor, false, "he has no login (Archive needs it removed), so nobody is emailed");
  assert.ok(!calls.some(isEmailRow));
  const lock = calls.findIndex(isContactLock);
  assert.deepEqual(calls[lock].args, ["c-zack"]);
  const order = [calls.findIndex(isTaskLock), lock, firstWrite(calls)];
  assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `task lock, contact lock, then writes: ${order}`);
});

test("setStatus: the reopen's Undo gives it back for APPROVAL_UNDO_MS after the reopen, that instant included, as undoApproval counts", async () => {
  const reopenAt = (ms: number) => ({ ...REOPEN, createdAt: ago(ms) });
  assert.equal((await close("OPEN", "DONE", [reopenAt(APPROVAL_UNDO_MS), DROP])).assignee, "c-zack", "exactly at the limit");
  const late = await close("OPEN", "DONE", [reopenAt(APPROVAL_UNDO_MS + 1), DROP]);
  assert.equal(late.assignee, null, "a millisecond past it");
  assert.deepEqual(late.lines, [], "no ASSIGNED line nobody picked");
});

test("setStatus: a Done job reopened to Review, then approved inside the window, is his again", async () => {
  // Approve is the way back to Done from Review. (A Canceled job reopened to Review, then approved, isn't: below.)
  const { assignee, lines } = await close("REVIEW", "DONE", [{ ...REOPEN, data: { ...REOPEN.data, to: "REVIEW" } }, DROP]);
  assert.equal(assignee, "c-zack");
  assert.deepEqual(
    lines.map((e) => e.data),
    [GIVEN_BACK],
  );
});

test("setStatus: a Canceled job's reopen, undone inside the window, is his again; locks: task, then his contact", async () => {
  // For a Canceled job, Cancel is the way back: its reopen's Undo gives it back from any open status the reopen chose,
  // as a Done job's does. (The timeline shows none of the four lines: below.)
  const canceledReopen = (open: string, ms = 20_000): Line => ({ ...REOPEN, data: { from: "CANCELED", to: open, dropped: "c-zack" }, createdAt: ago(ms) });
  for (const open of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"]) {
    const { assignee, lines, calls, r } = await close(open, "CANCELED", [canceledReopen(open), DROP]);
    assert.equal(assignee, "c-zack", `reopened to ${open}, then Canceled again`);
    assert.deepEqual(
      lines.map((e) => e.data),
      [GIVEN_BACK],
      open,
    );
    assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"), `${open}: his access row comes back`);
    assert.equal(r.emailsContractor, false, open);
    assert.ok(!calls.some(isEmailRow), `${open}: no email row`);
    const lock = calls.findIndex(isContactLock);
    assert.deepEqual(calls[lock].args, ["c-zack"]);
    const order = [calls.findIndex(isTaskLock), lock, firstWrite(calls)];
    assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `${open}: task lock, contact lock, then writes: ${order}`);
  }
  // The same window as a Done job's: that instant included, a millisecond past it not.
  assert.equal((await close("OPEN", "CANCELED", [canceledReopen("OPEN", APPROVAL_UNDO_MS), DROP])).assignee, "c-zack", "exactly at the limit");
  const late = await close("OPEN", "CANCELED", [canceledReopen("OPEN", APPROVAL_UNDO_MS + 1), DROP]);
  assert.equal(late.assignee, null, "a millisecond past it");
  assert.deepEqual(late.lines, [], "no ASSIGNED line nobody picked");
});

test("setStatus: Approve again after Approve's Undo gives the job back, however much later", async () => {
  // Approve's Undo writes no status line of its own (the Done line is soft-deleted): the drop is the latest line.
  for (const at of [ago(20_000), ago(APPROVAL_UNDO_MS + 1), ago(3 * 24 * 60 * 60_000)]) {
    const { assignee, lines, calls } = await close("REVIEW", "DONE", [{ ...DROP, createdAt: at }, MARK_DONE]);
    assert.equal(assignee, "c-zack", `Approve ${NOW.getTime() - at.getTime()} ms after the Undo`);
    assert.deepEqual(
      lines.map((e) => e.data),
      [GIVEN_BACK],
    );
    // Task lock, then his contact, then the first write, as on the reopen path.
    const lock = calls.findIndex(isContactLock);
    assert.deepEqual(calls[lock].args, ["c-zack"]);
    const order = [calls.findIndex(isTaskLock), lock, firstWrite(calls)];
    assert.ok(order[0] === 0 && order[1] > order[0] && order[2] > order[1], `task lock, contact lock, then writes: ${order}`);
  }
});

test("setStatus: no give-back for any other close, once the job moved or was assigned since, or for a contractor restored since", async () => {
  const jose = { ...DROP, data: { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } } };
  const unassigned = { kind: "ASSIGNED", data: { from: { userId: null, contactId: "c-jose" }, to: { userId: null, contactId: null } }, createdAt: ago(10_000) };
  const cases: [string, string, "DONE" | "CANCELED", Line[]][] = [
    ["a reopen older than the Undo's window", "OPEN", "DONE", [{ ...REOPEN, createdAt: ago(10 * 60_000) }, { ...DROP, createdAt: ago(10 * 60_000) }]],
    // A Done job reopened, then Canceled, still closes unassigned: Cancel isn't the way back to Done.
    ...(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] as const).map((open): [string, string, "DONE" | "CANCELED", Line[]] => [
      `a Done job reopened to ${open}, then Canceled`,
      open,
      "CANCELED",
      [{ ...REOPEN, data: { ...REOPEN.data, to: open } }, DROP],
    ]),
    ["a reopen of a Canceled job, then Done", "OPEN", "DONE", [{ ...REOPEN, data: { ...REOPEN.data, from: "CANCELED" } }, DROP]],
    // Approve matches Review to Done too: only the reopen's own rule decides after a reopen.
    ["a Canceled job reopened to Review, then approved", "REVIEW", "DONE", [{ ...REOPEN, data: { ...REOPEN.data, from: "CANCELED", to: "REVIEW" } }, DROP]],
    // And the window still holds: a Done job reopened to Review is his again only for the Undo's 2 minutes.
    [
      "a Done job reopened to Review, approved past the window",
      "REVIEW",
      "DONE",
      [{ ...REOPEN, data: { ...REOPEN.data, to: "REVIEW" }, createdAt: ago(APPROVAL_UNDO_MS + 1) }, { ...DROP, createdAt: ago(APPROVAL_UNDO_MS + 1) }],
    ],
    [
      "a Canceled job's reopen older than the Undo's window",
      "OPEN",
      "CANCELED",
      [{ ...REOPEN, data: { ...REOPEN.data, from: "CANCELED" }, createdAt: ago(10 * 60_000) }, { ...DROP, createdAt: ago(10 * 60_000) }],
    ],
    ["a Cancel after Approve's Undo", "REVIEW", "CANCELED", [DROP, MARK_DONE]],
    ["Approve's drop on a job no longer in Review", "OPEN", "DONE", [DROP, MARK_DONE]],
    ["moved since the reopen", "IN_PROGRESS", "DONE", [{ kind: "STATUS", data: { from: "OPEN", to: "IN_PROGRESS" }, createdAt: ago(10_000) }, REOPEN, DROP]],
    ["assigned and unassigned since", "OPEN", "DONE", [unassigned, REOPEN, DROP]],
    ["a reopen that dropped nobody", "OPEN", "DONE", [{ ...REOPEN, data: { from: "DONE", to: "OPEN" } }, unassigned]],
    ["sent back after Approve's Undo", "IN_PROGRESS", "DONE", [{ kind: "STATUS", data: { from: "REVIEW", to: "IN_PROGRESS" }, createdAt: ago(10_000) }, DROP]],
    // A move that wrote no line (service.ts cancelOpenAutoTask's Cancel, when a property's key date is cleared; the
    // hand-run Asana importer's writeTask) moved the job since the reopen, so the reopen is still the latest line. The
    // toast's Undo is refused (it expects the status the reopen left), and a close from anywhere else isn't the Undo: a
    // real one starts where the reopen left the job. Each kind of close and each place it can start from:
    ["a reopen, a Cancel with no line, then Done", "CANCELED", "DONE", [REOPEN, DROP]],
    ["a reopen to Review, a Cancel with no line, then Done", "CANCELED", "DONE", [{ ...REOPEN, data: { ...REOPEN.data, to: "REVIEW" } }, DROP]],
    ["a reopen, a move to In progress with no line, then Done", "IN_PROGRESS", "DONE", [REOPEN, DROP]],
    ["a Canceled job's reopen, a move to In progress with no line, then Canceled", "IN_PROGRESS", "CANCELED", [{ ...REOPEN, data: { ...REOPEN.data, from: "CANCELED" } }, DROP]],
    ["a Canceled job's reopen, a Done with no line, then Canceled", "DONE", "CANCELED", [{ ...REOPEN, data: { ...REOPEN.data, from: "CANCELED" } }, DROP]],
    // A reopen gives back only the contractor it marked as its own drop.
    // Approve's Undo left a drop, a Cancel wrote no line (service.ts cancelOpenAutoTask), and the job, unassigned, was
    // reopened (no drop, no mark) and Canceled again inside the window: the drop isn't the reopen's.
    ["a reopen with no mark after a drop it didn't write", "OPEN", "CANCELED", [{ ...REOPEN, data: { from: "CANCELED", to: "OPEN" } }, DROP]],
    ["a reopen written before the mark", "OPEN", "DONE", [{ ...REOPEN, data: { from: "DONE", to: "OPEN" } }, DROP]],
    ["a marked reopen whose line before it isn't a drop", "OPEN", "DONE", [REOPEN, unassigned]],
    ["a marked reopen whose drop before it names someone else", "OPEN", "DONE", [REOPEN, jose]],
    // Approve's rule needs the latest line to be an archived drop, not just any ASSIGNED line: a contractor unassigned by
    // hand while the job was in Review, archived since, isn't given the job back when it is approved.
    ["Approve after a contractor was unassigned by hand, then archived", "REVIEW", "DONE", [unassigned, MARK_DONE]],
  ];
  // Jose is archived here too, so a case can't pass just because the contractor it would wrongly give the job to
  // isn't: no contractor is even read (no Contact lock), since none of these is the way back.
  for (const [why, status, to, rows] of cases) {
    const { assignee, lines, calls } = await close(status, to, rows, NOW, ["c-zack", "c-jose"]);
    assert.equal(assignee, null, why);
    assert.deepEqual(lines, [], `${why}: no ASSIGNED line nobody picked`);
    assert.ok(!calls.some((c) => c.model === "taskAccess" && c.op === "upsert"), `${why}: no access row`);
    assert.ok(!calls.some(isContactLock), `${why}: no contractor read`);
  }
  // A contractor restored since is in the picker again: his reopen's Undo reads him under the lock, as not archived.
  const restored = await close("OPEN", "DONE", [{ ...REOPEN, data: { ...REOPEN.data, dropped: "c-jose" } }, jose]);
  assert.equal(restored.assignee, null, "a contractor no longer archived");
  assert.deepEqual(restored.lines, []);
  assert.deepEqual(restored.calls.filter(isContactLock).map((c) => c.args), [["c-jose"]]);
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

test("a reopen and its Undo fold into one line again; the drop and the give-back stay inside it", () => {
  const names = { contacts: { "c-zack": "Zack Outlaw" } };
  const dropped = ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1" });
  const reopened = ev("STATUS", REOPEN.data, "2026-10-23T15:00:00.000Z", { id: "e2" });
  const back = ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "e3" });
  const done = ev("STATUS", { from: "OPEN", to: "DONE" }, "2026-10-23T15:00:20.000Z", { id: "e4", visibility: "SHARED" });
  const out = buildActivity([dropped, reopened, back, done], names, "2026-10-23");
  assert.equal(out.length, 1, JSON.stringify(out.map((e) => ("text" in e ? e.text : e.type))));
  const run = out[0];
  assert.ok(run.type === "run");
  // As any reopen and its Undo read (activity.test.ts), not "Unassigned because Zack Outlaw is archived and made 3 more changes".
  assert.equal(run.text, "Pieter set status to To do, then back to Done");
  assert.equal(run.status, "DONE");
  assert.deepEqual(
    run.lines.map((l) => l.text),
    ["Unassigned because Zack Outlaw is archived", "Pieter set status to To do", "Assigned back to Zack Outlaw", "Pieter set status to Done"],
  );
  // A reopen left open still says why it's unassigned, as its own line.
  assert.deepEqual(
    buildActivity([dropped, reopened], names, "2026-10-23").map((e) => ("text" in e ? e.text : e.type)),
    ["Unassigned because Zack Outlaw is archived", "Pieter set status to To do"],
  );
});

test("the give-back rides only with the drop that took the job from the same contractor", () => {
  // setStatus writes the give-back from the drop, so the two always name one contractor; the pairing still checks it.
  const names = { contacts: { "c-zack": "Zack Outlaw", "c-jose": "Jose Alvarez" } };
  const zackDropped = ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1" });
  const joseDropped = ev("ASSIGNED", { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } }, "2026-10-23T15:00:00.000Z", { id: "e2" });
  const reopened = ev("STATUS", REOPEN.data, "2026-10-23T15:00:00.000Z", { id: "e3" });
  const back = ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "e4" });
  const done = ev("STATUS", { from: "OPEN", to: "DONE" }, "2026-10-23T15:00:20.000Z", { id: "e5", visibility: "SHARED" });
  const out = buildActivity([zackDropped, joseDropped, reopened, back, done], names, "2026-10-23");
  // Zack's drop and his give-back fold into the Undo; Jose's drop stays a line of its own, not folded in with them.
  assert.deepEqual(
    out.map((e) => ("text" in e ? e.text : e.type)),
    ["Pieter set status to To do, then back to Done", "Unassigned because Jose Alvarez is archived"],
  );
  const run = out[0];
  assert.ok(run.type === "run");
  assert.deepEqual(
    run.lines.map((l) => l.text),
    ["Unassigned because Zack Outlaw is archived", "Pieter set status to To do", "Assigned back to Zack Outlaw", "Pieter set status to Done"],
  );
});

test("the give-back line names who has the job again, and never pairs or merges with an assignment", () => {
  const names = { contacts: { "c-zack": "Zack Outlaw", "c-jose": "Jose Alvarez" } };
  const back = ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:00.000Z", { id: "e1" });
  assert.equal(eventLine(back, names, "2026-10-23").text, "Assigned back to Zack Outlaw");
  assert.equal(eventLine(back, {}, "2026-10-23").text, "Assigned back to the contractor");
  const texts = (es: ActivityEvent[]) => buildActivity(es, names, "2026-10-23").map((e) => ("text" in e ? e.text : e.type));
  // Pieter takes the job back off Zack a minute after Approve gave it back: nobody's pick to undo, so both lines stay.
  const off = ev("ASSIGNED", { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: null } }, "2026-10-23T15:01:00.000Z", { id: "e2" });
  assert.deepEqual(texts([back, off]), ["Assigned back to Zack Outlaw", "Pieter unassigned this"]);
  // A pick in the same burst is its own sentence; the give-back isn't folded under it.
  const jose = ev("ASSIGNED", { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: "c-jose" } }, "2026-10-23T15:01:00.000Z", { id: "e2" });
  assert.deepEqual(texts([back, jose]), ["Assigned back to Zack Outlaw", "Pieter assigned Jose Alvarez"]);
  // Approve's Undo, then Approve again: no status change in the burst to ride with, so the two lines stand.
  const dropped = ev("ASSIGNED", DROP.data, "2026-10-23T14:59:00.000Z", { id: "e0" });
  assert.deepEqual(texts([dropped, back]), ["Unassigned because Zack Outlaw is archived", "Assigned back to Zack Outlaw"]);
});

/* ---------------- A Canceled job's reopen and its Undo, and what leads a fold (the task session's second ruling) ---------------- */

const NAMES = { contacts: { "c-zack": "Zack Outlaw", "c-jose": "Jose Alvarez", "c-mike": "Mike Mason" } };
const CONNOR = { actorLabel: "Connor Swofford", actorUserId: "u-connor" };
const shown = (es: ActivityEvent[]) => buildActivity(es, NAMES, "2026-10-23").map((e) => ("text" in e ? e.text : e.type));

// Zack had the job and Pieter canceled it last week. A Canceled line is Internal even with a contractor.
const CANCELED_HISTORY = [
  ev("ASSIGNED", { from: { userId: null, contactId: null }, to: { userId: null, contactId: "c-zack" } }, "2026-10-10T14:00:00.000Z", { id: "h1" }),
  ev("STATUS", { from: "OPEN", to: "CANCELED" }, "2026-10-16T14:00:00.000Z", { id: "h2" }),
];
// Today Pieter reopened it, which took it off Zack, and tapped Undo 20 seconds later, which gave it back (setStatus
// writes each status line right after its drop or give-back).
const canceledReopenAndUndo = (over: { drop?: Partial<ActivityEvent>; undo?: Partial<ActivityEvent> } = {}) => [
  ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1", ...over.drop }),
  ev("STATUS", { from: "CANCELED", to: "OPEN" }, "2026-10-23T15:00:00.000Z", { id: "e2", ...over.drop }),
  ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "e3", ...over.undo }),
  ev("STATUS", { from: "OPEN", to: "CANCELED" }, "2026-10-23T15:00:20.000Z", { id: "e4", ...over.undo }),
];

test("a Canceled job's reopen and its Undo show nothing, as an unassigned Canceled job's do", () => {
  const undone = canceledReopenAndUndo();
  assert.deepEqual(shown([...CANCELED_HISTORY, ...undone]), ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled"]);
  // A job nobody had: its reopen and Undo leave only the Cancel too.
  assert.deepEqual(shown([CANCELED_HISTORY[1], undone[1], undone[3]]), ["Pieter set status to Canceled"]);
  // Anything else Pieter did in the same burst still shows, alone.
  const notes = ev("NOTES", { from: "Old", to: "New" }, "2026-10-23T15:01:00.000Z", { id: "e5" });
  assert.deepEqual(shown([...CANCELED_HISTORY, ...undone, notes]), ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled", "Pieter edited the notes"]);
});

test("the drop and the give-back stay unless the status lines written with them went as one reversed pair", () => {
  // Connor's reopen and Pieter's Cancel aren't one person's reversal: all four lines show.
  assert.deepEqual(shown([...CANCELED_HISTORY, ...canceledReopenAndUndo({ drop: CONNOR })]), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor set status to To do",
    "Assigned back to Zack Outlaw",
    "Pieter set status to Canceled",
  ]);
  // Reversed, with nobody given back (Zack restored since): the drop still says why the job is unassigned.
  const [drop, reopen, , cancel] = canceledReopenAndUndo();
  assert.deepEqual(shown([...CANCELED_HISTORY, drop, reopen, cancel]), ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled", "Unassigned because Zack Outlaw is archived"]);
  // A give-back of another contractor than the drop named: both stay.
  const jose = { ...drop, data: { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } } };
  const [, , back] = canceledReopenAndUndo();
  assert.deepEqual(shown([jose, reopen, back, cancel]), ["Unassigned because Jose Alvarez is archived", "Assigned back to Zack Outlaw"]);
  // The give-back goes with the drop whose status line was paired with ITS status line, in either order, not with any
  // drop that was held at all. One person inside two minutes: Cancel, reopen (drop), Undo (give-back, Cancel), reopen
  // again (drop). The first reopen pairs with the first Cancel, which wrote no give-back, so that drop stays. The
  // Undo's Cancel pairs with the second reopen, so its give-back and that reopen's drop go as one. The job is open and
  // unassigned, and the timeline says why. An internal comment between the Undo and the second reopen shows which
  // drop stays: the first, before the comment, not the second, which a give-back held with any drop would leave.
  const cancelReopenUndoReopen = [
    CANCELED_HISTORY[0],
    ev("STATUS", { from: "OPEN", to: "CANCELED" }, "2026-10-23T14:59:30.000Z", { id: "e0" }),
    ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1" }),
    ev("STATUS", { from: "CANCELED", to: "OPEN" }, "2026-10-23T15:00:00.000Z", { id: "e2" }),
    ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "e3" }),
    ev("STATUS", { from: "OPEN", to: "CANCELED" }, "2026-10-23T15:00:20.000Z", { id: "e4" }),
    ev("ASSIGNED", DROP.data, "2026-10-23T15:00:25.000Z", { id: "e5" }),
    ev("STATUS", { from: "CANCELED", to: "OPEN" }, "2026-10-23T15:00:25.000Z", { id: "e6" }),
  ];
  assert.deepEqual(shown(cancelReopenUndoReopen), ["Pieter assigned Zack Outlaw", "Unassigned because Zack Outlaw is archived"]);
  const withComment = [...cancelReopenUndoReopen, ev("COMMENT", {}, "2026-10-23T15:00:22.000Z", { id: "e4a", body: "Hold on" })];
  assert.deepEqual(shown(withComment), ["Pieter assigned Zack Outlaw", "Unassigned because Zack Outlaw is archived", "comment"]);
  // Approve, its Undo and Approve again inside two minutes read as they always did: the Undo writes no status line.
  const review = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, "2026-10-23T14:58:00.000Z", {
    id: "a1",
    visibility: "SHARED",
    actorLabel: "Zack Outlaw",
    actorUserId: null,
    actorContactId: "c-zack",
    source: "PORTAL",
  });
  const approved = ev("STATUS", { from: "REVIEW", to: "DONE" }, "2026-10-23T15:00:00.000Z", { id: "a2", visibility: "SHARED", deletedAt: new Date("2026-10-23T15:00:30.000Z") });
  const dropped = ev("ASSIGNED", DROP.data, "2026-10-23T15:00:30.000Z", { id: "a3" });
  const givenBack = ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:01:00.000Z", { id: "a4" });
  const again = ev("STATUS", { from: "REVIEW", to: "DONE" }, "2026-10-23T15:01:00.000Z", { id: "a5", visibility: "SHARED" });
  assert.deepEqual(shown([review, approved, dropped, givenBack, again]), [
    "Zack marked this done",
    "Unassigned because Zack Outlaw is archived",
    "Assigned back to Zack Outlaw",
    "Pieter approved this",
  ]);
});

test("a give-back and the drop that undid it go as one too, when the give-back came first", () => {
  // Connor reopens Zack's Canceled job (a drop). Pieter Cancels inside 2 minutes, which gives it back, then taps that
  // toast's Undo (a drop again). Pieter's Cancel and its Undo pair, so his give-back and his drop go with them, and
  // the job, open and unassigned, reads as Connor's reopen.
  const flow = [
    ...CANCELED_HISTORY,
    ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1", ...CONNOR }),
    ev("STATUS", { from: "CANCELED", to: "OPEN", dropped: "c-zack" }, "2026-10-23T15:00:00.000Z", { id: "e2", ...CONNOR }),
    ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "e3" }),
    ev("STATUS", { from: "OPEN", to: "CANCELED" }, "2026-10-23T15:00:20.000Z", { id: "e4" }),
    ev("ASSIGNED", DROP.data, "2026-10-23T15:00:30.000Z", { id: "e5" }),
    ev("STATUS", { from: "CANCELED", to: "OPEN", dropped: "c-zack" }, "2026-10-23T15:00:30.000Z", { id: "e6" }),
  ];
  assert.deepEqual(shown(flow), ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled", "Unassigned because Zack Outlaw is archived", "Connor set status to To do"]);
  // A drop of someone else than the give-back named stays, with the give-back.
  const jose = ev("ASSIGNED", { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } }, "2026-10-23T15:00:30.000Z", { id: "e5" });
  assert.deepEqual(shown([...flow.slice(0, 6), jose, flow[7]]).slice(4), ["Assigned back to Zack Outlaw", "Unassigned because Jose Alvarez is archived"]);
});

test("a drop and a give-back are held only with the status lines written right after them, not a paired rename", () => {
  // Hand-built, all Pieter inside 2 minutes: a drop, a rename, then a give-back followed directly by the rename's
  // reversal. The renames pair and go, but neither is a STATUS line, so neither was written with the drop or the
  // give-back, and both stay.
  assert.deepEqual(
    shown([
      ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "r1" }),
      ev("TITLE", { from: "Patch roof", to: "Patch roof (east)" }, "2026-10-23T15:00:10.000Z", { id: "r2" }),
      ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "r3" }),
      ev("TITLE", { from: "Patch roof (east)", to: "Patch roof" }, "2026-10-23T15:00:30.000Z", { id: "r4" }),
    ]),
    ["Unassigned because Zack Outlaw is archived", "Assigned back to Zack Outlaw"],
  );
});

test("a real flow, kept as a regression case: Approve's Undo, a rename, Approve again, a restore, its Undo, the rename undone", () => {
  // All Pieter: Approve, Zack archived, Approve's Undo (a drop, no status line), a rename, Approve again (the
  // give-back), Zack restored, that approval's Undo (no drop: he isn't archived), and the rename undone inside 2
  // minutes. The renames pair and hide; the drop and the give-back were written with no status line of a reversed
  // pair, so both stay, and the job reads as his again. (heldPairs reads undone lines too, so the line after the
  // give-back is its own undone approval, which pairs with nothing: the case above pins the STATUS check.)
  const review = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, "2026-10-23T14:58:00.000Z", {
    id: "m1",
    visibility: "SHARED",
    actorLabel: "Zack Outlaw",
    actorUserId: null,
    actorContactId: "c-zack",
    source: "PORTAL",
  });
  const undone = (id: string, at: string, deletedAt: string) => ev("STATUS", { from: "REVIEW", to: "DONE" }, at, { id, visibility: "SHARED", deletedAt: new Date(deletedAt) });
  assert.deepEqual(
    shown([
      review,
      undone("m2", "2026-10-23T14:59:50.000Z", "2026-10-23T15:00:00.000Z"),
      ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "m3" }),
      ev("TITLE", { from: "Patch roof", to: "Patch roof (east)" }, "2026-10-23T15:00:10.000Z", { id: "m4" }),
      ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "m5" }),
      undone("m6", "2026-10-23T15:00:20.000Z", "2026-10-23T15:00:40.000Z"),
      ev("TITLE", { from: "Patch roof (east)", to: "Patch roof" }, "2026-10-23T15:00:50.000Z", { id: "m7" }),
    ]),
    ["Zack marked this done", "Unassigned because Zack Outlaw is archived", "Assigned back to Zack Outlaw"],
  );
});

test("a give-back whose own approval was undone isn't held with a later drop, though the next line it stands before paired", () => {
  // All Pieter: Approve, Zack archived, Approve's Undo (a drop, no status line), Approve again (the give-back, written
  // with that approval's Done line), Zack restored, that approval's Undo (its Done line is soft-deleted, and no drop:
  // he isn't archived), Cancel from Review, Zack archived again, and a reopen to Review inside 2 minutes (a marked
  // drop). The Cancel and the reopen pair, but the give-back was written with the undone approval, not with the Cancel,
  // so neither it nor the reopen's drop is held: all three lines show, as they did before low 2.
  const review = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, "2026-10-23T14:58:00.000Z", {
    id: "n1",
    visibility: "SHARED",
    actorLabel: "Zack Outlaw",
    actorUserId: null,
    actorContactId: "c-zack",
    source: "PORTAL",
  });
  const approved = (id: string, at: string, deletedAt: string) => ev("STATUS", { from: "REVIEW", to: "DONE" }, at, { id, visibility: "SHARED", deletedAt: new Date(deletedAt) });
  const flow = [
    review,
    approved("n2", "2026-10-23T14:59:50.000Z", "2026-10-23T15:00:00.000Z"),
    ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "n3" }),
    ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:20.000Z", { id: "n4" }),
    approved("n5", "2026-10-23T15:00:20.000Z", "2026-10-23T15:00:40.000Z"),
    ev("STATUS", { from: "REVIEW", to: "CANCELED" }, "2026-10-23T15:00:50.000Z", { id: "n6" }),
    ev("ASSIGNED", DROP.data, "2026-10-23T15:01:20.000Z", { id: "n7" }),
    ev("STATUS", { from: "CANCELED", to: "REVIEW", dropped: "c-zack" }, "2026-10-23T15:01:20.000Z", { id: "n8" }),
  ];
  assert.deepEqual(shown(flow), ["Zack marked this done", "Unassigned because Zack Outlaw is archived and made 2 more changes"]);
  const run = buildActivity(flow, NAMES, "2026-10-23")[1];
  assert.ok(run.type === "run");
  assert.deepEqual(
    run.lines.map((l) => l.text),
    ["Unassigned because Zack Outlaw is archived", "Assigned back to Zack Outlaw", "Unassigned because Zack Outlaw is archived"],
  );
  // A reassignment away from Zack and back between the Cancel and the reopen doesn't change it: the job is in Review and
  // unassigned, and the timeline has to end on why, not on a pick it no longer has.
  const picks = [
    ev("ASSIGNED", { from: { userId: null, contactId: "c-zack" }, to: { userId: null, contactId: "c-jose" } }, "2026-10-23T15:01:00.000Z", { id: "n6a", ...CONNOR }),
    ev("ASSIGNED", { from: { userId: null, contactId: "c-jose" }, to: { userId: null, contactId: "c-zack" } }, "2026-10-23T15:01:10.000Z", { id: "n6b" }),
  ];
  assert.deepEqual(shown([...flow.slice(0, 6), ...picks, ...flow.slice(6)]), [
    "Zack marked this done",
    "Unassigned because Zack Outlaw is archived",
    "Assigned back to Zack Outlaw",
    "Connor assigned Jose Alvarez",
    "Pieter assigned Zack Outlaw",
    "Unassigned because Zack Outlaw is archived",
  ]);
});

test("a drop or give-back line never leads a fold while the burst has a change of someone's to lead with", () => {
  const edits = (from: number) => [
    ev("DUE", { from: "2026-10-20", to: "2026-10-30" }, `2026-10-23T15:01:${from}.000Z`, { id: "e8" }),
    ev("TITLE", { from: "Patch roof", to: "Patch roof (east)" }, `2026-10-23T15:01:${from + 10}.000Z`, { id: "e9" }),
  ];
  const undo = [
    ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:01:00.000Z", { id: "e6" }),
    ev("STATUS", { from: "OPEN", to: "DONE" }, "2026-10-23T15:01:00.000Z", { id: "e7", visibility: "SHARED" }),
  ];
  const folded = ["Assigned back to Zack Outlaw", "Pieter set status to Done", "Pieter moved the due date to Fri, Oct 30", "Pieter renamed this from “Patch roof”"];
  // P1: Connor reopens Zack's Done job. Within 2 minutes Pieter sets it back to Done, moves the due date and renames it.
  const p1 = buildActivity(
    [
      ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1", ...CONNOR }),
      ev("STATUS", REOPEN.data, "2026-10-23T15:00:00.000Z", { id: "e2", ...CONNOR }),
      ...undo,
      ...edits(30),
    ],
    NAMES,
    "2026-10-23",
  );
  assert.deepEqual(
    p1.map((e) => ("text" in e ? e.text : e.type)),
    ["Unassigned because Zack Outlaw is archived", "Connor set status to To do", "Pieter set status to Done and made 3 more changes"],
  );
  assert.deepEqual(p1[2].type === "run" && p1[2].lines.map((l) => l.text), folded, "the give-back is still inside the fold");
  // P1b: Pieter reopens, posts an internal note, taps Undo inside the 2 minutes, then edits.
  const p1b = buildActivity(
    [
      ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1" }),
      ev("STATUS", REOPEN.data, "2026-10-23T15:00:00.000Z", { id: "e2" }),
      ev("COMMENT", {}, "2026-10-23T15:00:30.000Z", { id: "e3", body: "Reopening for the punch list" }),
      ...undo,
      ...edits(30),
    ],
    NAMES,
    "2026-10-23",
  );
  assert.deepEqual(
    p1b.map((e) => ("text" in e ? e.text : e.type)),
    ["Unassigned because Zack Outlaw is archived", "Pieter set status to To do", "comment", "Pieter set status to Done and made 3 more changes"],
  );
  assert.deepEqual(p1b[3].type === "run" && p1b[3].lines.map((l) => l.text), folded);
  // One person's reopen and Undo of a Done job, then a due date and a rename. The drop and the give-back ride with the
  // statuses, so that group has sentences of its own and leads, however many of its lines are a drop or a give-back.
  assert.deepEqual(
    shown([
      ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "e1" }),
      ev("STATUS", REOPEN.data, "2026-10-23T15:00:00.000Z", { id: "e2" }),
      ...undo,
      ...edits(30),
    ]),
    ["Pieter set status to To do, then back to Done and made 2 more changes"],
  );
  // Approve's Undo, a checklist tick, then Approve again; and Approve's Undo, a tick and a due date, left in Review.
  const approved = ev("STATUS", { from: "REVIEW", to: "DONE" }, "2026-10-23T14:59:30.000Z", { id: "a1", visibility: "SHARED", deletedAt: new Date("2026-10-23T15:00:00.000Z") });
  const dropped = ev("ASSIGNED", DROP.data, "2026-10-23T15:00:00.000Z", { id: "a2" });
  const tick = ev("CHECKLIST", { itemId: "i1", title: "Caulk the flashing", done: true }, "2026-10-23T15:00:20.000Z", { id: "a3" });
  const givenBack = ev("ASSIGNED", GIVEN_BACK, "2026-10-23T15:00:40.000Z", { id: "a4" });
  const again = ev("STATUS", { from: "REVIEW", to: "DONE" }, "2026-10-23T15:00:40.000Z", { id: "a5", visibility: "SHARED" });
  assert.deepEqual(shown([approved, dropped, tick, givenBack, again]), ["Pieter checked “Caulk the flashing” and made 2 more changes", "Pieter approved this"]);
  const due = ev("DUE", { from: "2026-10-20", to: "2026-10-30" }, "2026-10-23T15:00:30.000Z", { id: "a6" });
  assert.deepEqual(shown([approved, dropped, tick, due]), ["Pieter checked “Caulk the flashing” and made 2 more changes"]);
  // With nothing but such lines in the burst, the first still leads.
  const jose = ev("ASSIGNED", { ...DROP.data, from: { userId: null, contactId: "c-jose", name: null } }, "2026-10-23T15:00:50.000Z", { id: "a7" });
  assert.deepEqual(shown([dropped, givenBack, jose]), ["Unassigned because Zack Outlaw is archived and made 2 more changes"]);
});

/* ---------------- Someone else's status change between a change and its reversal (the task session's fourth review) ---------------- */

const DANA = { actorLabel: "Dana Reyes", actorUserId: "u-dana" };
/**
 * The rows one setStatus wrote, as real runs on a scratch database wrote them (three staff, Zack archived, every step
 * inside 2 minutes): its drop or give-back, then its STATUS line, which names the drop it wrote (`dropped`).
 */
function wrote(id: string, at: string, by: Partial<ActivityEvent>, from: string, to: string, first: "drop" | "give" | null, visibility: "INTERNAL" | "SHARED" = "INTERNAL") {
  const status = ev("STATUS", { from, to, ...(first === "drop" ? { dropped: "c-zack" } : {}) }, at, { id: `${id}b`, visibility, ...by });
  return first ? [ev("ASSIGNED", first === "drop" ? DROP.data : GIVEN_BACK, at, { id: `${id}a`, ...by }), status] : [status];
}
const step = (n: number) => `2026-10-23T15:00:${String(n * 5).padStart(2, "0")}.000Z`;

test("flow B: a Cancel and the same person's reopen with others' moves between them stay; it reads Done and unassigned", () => {
  // Pieter reopens Zack's Canceled job, Connor cancels it (gives it back), Pieter reopens, Dana cancels (gives it
  // back), Connor reopens and finishes it. The job is Done and nobody's. Connor's Cancel and his reopen aren't one
  // person's there and back: Pieter's reopen and Dana's Cancel came between.
  const flow = [
    ...CANCELED_HISTORY,
    ...wrote("s1", step(0), {}, "CANCELED", "IN_PROGRESS", "drop"),
    ...wrote("s2", step(1), CONNOR, "IN_PROGRESS", "CANCELED", "give"),
    ...wrote("s3", step(2), {}, "CANCELED", "OPEN", "drop"),
    ...wrote("s4", step(3), DANA, "OPEN", "CANCELED", "give"),
    ...wrote("s5", step(4), CONNOR, "CANCELED", "IN_PROGRESS", "drop"),
    ...wrote("s6", step(5), CONNOR, "IN_PROGRESS", "DONE", null),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to In progress",
    "Assigned back to Zack Outlaw",
    "Connor set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to To do",
    "Assigned back to Zack Outlaw",
    "Dana set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor changed the status 2 times, now Done",
  ]);
});

test("flow T2R: two partners, with a Done job's reopen and approval between Connor's Cancel and his reopen; it reads Review and unassigned", () => {
  const flow = [
    ...CANCELED_HISTORY,
    ...wrote("s1", step(0), {}, "CANCELED", "REVIEW", "drop"),
    ...wrote("s2", step(1), CONNOR, "REVIEW", "CANCELED", "give"),
    ...wrote("s3", step(2), {}, "CANCELED", "DONE", null, "SHARED"),
    ...wrote("s4", step(3), {}, "DONE", "REVIEW", "drop"),
    ...wrote("s5", step(4), {}, "REVIEW", "DONE", "give", "SHARED"),
    ...wrote("s6", step(5), {}, "DONE", "CANCELED", null),
    ...wrote("s7", step(6), CONNOR, "CANCELED", "REVIEW", "drop"),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to Review",
    "Assigned back to Zack Outlaw",
    "Connor set status to Canceled",
    "Pieter set status to Done",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to Review",
    "Assigned back to Zack Outlaw",
    "Pieter approved this",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor set status to Review",
  ]);
});

test("flow D: Pieter's reopen and Cancel with Connor's between them stay; it reads Canceled and Zack's, and Canceled on a job nobody held", () => {
  // Pieter reopens to Review, Connor cancels (gives it back), reopens to To do and cancels again (his own there and
  // back, which goes with its drop and give-back), reopens to Review, and Pieter cancels inside the reopen's window,
  // which gives it back. The job is Canceled and Zack's.
  const flow = [
    ...CANCELED_HISTORY,
    ...wrote("s1", step(0), {}, "CANCELED", "REVIEW", "drop"),
    ...wrote("s2", step(1), CONNOR, "REVIEW", "CANCELED", "give"),
    ...wrote("s3", step(2), CONNOR, "CANCELED", "OPEN", "drop"),
    ...wrote("s4", step(3), CONNOR, "OPEN", "CANCELED", "give"),
    ...wrote("s5", step(4), CONNOR, "CANCELED", "REVIEW", "drop"),
    ...wrote("s6", step(5), {}, "REVIEW", "CANCELED", "give"),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to Review",
    "Assigned back to Zack Outlaw",
    "Connor set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor set status to Review",
    "Assigned back to Zack Outlaw",
    "Pieter set status to Canceled",
  ]);
  // The control: the same six steps on a Canceled job nobody held write only status lines. It reads Canceled.
  const nobodys = [
    CANCELED_HISTORY[1],
    ...wrote("s1", step(0), {}, "CANCELED", "REVIEW", null),
    ...wrote("s2", step(1), CONNOR, "REVIEW", "CANCELED", null),
    ...wrote("s3", step(2), CONNOR, "CANCELED", "OPEN", null),
    ...wrote("s4", step(3), CONNOR, "OPEN", "CANCELED", null),
    ...wrote("s5", step(4), CONNOR, "CANCELED", "REVIEW", null),
    ...wrote("s6", step(5), {}, "REVIEW", "CANCELED", null),
  ];
  assert.deepEqual(shown(nobodys), [
    "Pieter set status to Canceled",
    "Pieter set status to Review",
    "Connor set status to Canceled",
    "Connor set status to Review",
    "Pieter set status to Canceled",
  ]);
});

/* ---------------- Someone's assignment between a drop and a give-back (the verify pass on the fourth review) ---------------- */

/** One person's pick of `to` (a contractor id, or null for nobody) on a job that `from` held, as patchTask writes it. */
const picked = (id: string, at: string, by: Partial<ActivityEvent>, from: string | null, to: string | null) =>
  ev("ASSIGNED", { from: { userId: null, contactId: from }, to: { userId: null, contactId: to } }, at, { id, ...by });

test("G1: a pick of someone between a give-back and the drop that follows it keeps both; the job ends open and nobody's", () => {
  // Zack's Canceled job, Zack archived. Connor reopens it (a drop), Pieter cancels inside 2 minutes (the give-back),
  // Connor reassigns it to Jose, Dana's picker (loaded before Zack was archived) gives it to Zack again, and Pieter
  // reopens inside 2 minutes of his Cancel (a drop). Pieter's Cancel and reopen pair, but the give-back and the drop are
  // no there-and-back: two picks came between them. The job is open and unassigned, and the timeline ends on why.
  const flow = [
    ...CANCELED_HISTORY,
    ...wrote("s1", step(0), CONNOR, "CANCELED", "OPEN", "drop"),
    ...wrote("s2", step(1), {}, "OPEN", "CANCELED", "give"),
    picked("s3", step(2), CONNOR, "c-zack", "c-jose"),
    picked("s4", step(3), DANA, "c-jose", "c-zack"),
    ...wrote("s5", step(4), {}, "CANCELED", "OPEN", "drop"),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor set status to To do",
    "Assigned back to Zack Outlaw",
    "Connor assigned Jose Alvarez",
    "Dana assigned Zack Outlaw",
    "Unassigned because Zack Outlaw is archived",
  ]);
  // A pick and its reversal between them are no change: the give-back and the drop go together, as before.
  assert.deepEqual(
    shown([
      ...CANCELED_HISTORY,
      ...wrote("s1", step(0), CONNOR, "CANCELED", "OPEN", "drop"),
      ...wrote("s2", step(1), {}, "OPEN", "CANCELED", "give"),
      picked("s3", step(2), CONNOR, "c-zack", "c-jose"),
      picked("s4", step(3), CONNOR, "c-jose", "c-zack"),
      ...wrote("s5", step(4), {}, "CANCELED", "OPEN", "drop"),
    ]),
    ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled", "Unassigned because Zack Outlaw is archived", "Connor set status to To do"],
  );
  // A pick that was taken out of the log never happened: it doesn't stand between them either.
  assert.deepEqual(
    shown([
      ...CANCELED_HISTORY,
      ...wrote("s1", step(0), CONNOR, "CANCELED", "OPEN", "drop"),
      ...wrote("s2", step(1), {}, "OPEN", "CANCELED", "give"),
      { ...picked("s3", step(2), CONNOR, "c-zack", "c-jose"), deletedAt: new Date("2026-10-23T15:01:00.000Z") },
      ...wrote("s5", step(4), {}, "CANCELED", "OPEN", "drop"),
    ]),
    ["Pieter assigned Zack Outlaw", "Pieter set status to Canceled", "Unassigned because Zack Outlaw is archived", "Connor set status to To do"],
  );
});

// A pick by the person who wrote the waiting give-back stands too: the pick's own author doesn't keep the hold.
test("G1: the give-back's own author picking someone between it and the drop keeps both; the job ends open and nobody's", () => {
  // Zack's Canceled job, Zack archived. Connor reopens it (a drop), Pieter cancels inside 2 minutes (the give-back),
  // gives it to Jose, then Mike, then Zack again from a tab loaded before Zack was archived, adds an Internal comment,
  // and reopens inside 2 minutes of his Cancel (a drop). None of his picks pair, so the job moved between the two.
  const flow = [
    ...CANCELED_HISTORY,
    ...wrote("s1", step(0), CONNOR, "CANCELED", "OPEN", "drop"),
    ...wrote("s2", step(1), {}, "OPEN", "CANCELED", "give"),
    picked("s3", step(2), {}, "c-zack", "c-jose"),
    picked("s4", step(3), {}, "c-jose", "c-mike"),
    picked("s5", step(4), {}, "c-mike", "c-zack"),
    ev("COMMENT", {}, step(5), { id: "s6", body: "Back on his record" }),
    ...wrote("s7", step(6), {}, "CANCELED", "OPEN", "drop"),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter assigned Zack Outlaw",
    "Pieter set status to Canceled",
    "Unassigned because Zack Outlaw is archived",
    "Connor set status to To do",
    "Assigned back to Zack Outlaw",
    "Pieter assigned Zack Outlaw",
    "comment",
    "Unassigned because Zack Outlaw is archived",
  ]);
  // No stale tab: his pick of Jose, a pick of Mike and back to Jose (a pair), then the first pick's toast Undo to Zack.
  assert.deepEqual(
    shown([
      ...CANCELED_HISTORY,
      ...wrote("s1", step(0), CONNOR, "CANCELED", "OPEN", "drop"),
      ...wrote("s2", step(1), {}, "OPEN", "CANCELED", "give"),
      picked("s3", step(2), {}, "c-zack", "c-jose"),
      picked("s4", step(3), {}, "c-jose", "c-mike"),
      picked("s5", step(4), {}, "c-mike", "c-jose"),
      picked("s6", step(5), {}, "c-jose", "c-zack"),
      ev("COMMENT", {}, step(6), { id: "s7", body: "Back on his record" }),
      ...wrote("s8", step(7), {}, "CANCELED", "OPEN", "drop"),
    ]),
    [
      "Pieter assigned Zack Outlaw",
      "Pieter set status to Canceled",
      "Unassigned because Zack Outlaw is archived",
      "Connor set status to To do",
      "Assigned back to Zack Outlaw",
      "Pieter assigned Zack Outlaw",
      "comment",
      "Unassigned because Zack Outlaw is archived",
    ],
  );
  // His own earlier reopen and its Undo (a held drop of his) don't keep the hold either: the first flow behind them reads the same.
  assert.deepEqual(
    shown([
      ...CANCELED_HISTORY,
      ...wrote("p1", "2026-10-23T14:59:00.000Z", {}, "CANCELED", "OPEN", "drop"),
      ...wrote("p2", "2026-10-23T14:59:05.000Z", {}, "OPEN", "CANCELED", "give"),
      ...flow.slice(CANCELED_HISTORY.length),
    ]),
    [
      "Pieter assigned Zack Outlaw",
      "Pieter set status to Canceled",
      "Unassigned because Zack Outlaw is archived",
      "Connor set status to To do",
      "Assigned back to Zack Outlaw",
      "Pieter assigned Zack Outlaw",
      "comment",
      "Unassigned because Zack Outlaw is archived",
    ],
  );
});

test("G2: a pick and its reversal don't pair across a drop and a give-back between them; the job ends canceled and nobody's", () => {
  // Zack archived since. Pieter gives him the Canceled job with a picker loaded before that, reopens it to Review (a
  // drop), Connor cancels it inside 2 minutes (the give-back), and Pieter unassigns it inside 2 minutes of his pick.
  // The drop and the give-back moved the job in between, so the pick and the unassign are no there-and-back.
  const flow = [
    CANCELED_HISTORY[1],
    picked("g1", step(0), {}, null, "c-zack"),
    ...wrote("g2", step(4), {}, "CANCELED", "REVIEW", "drop"),
    ...wrote("g3", step(7), CONNOR, "REVIEW", "CANCELED", "give"),
    picked("g4", step(11), {}, "c-zack", null),
  ];
  assert.deepEqual(shown(flow), [
    "Pieter set status to Canceled",
    "Pieter assigned Zack Outlaw",
    "Unassigned because Zack Outlaw is archived",
    "Pieter set status to Review",
    "Assigned back to Zack Outlaw",
    "Connor set status to Canceled",
    "Pieter unassigned this",
  ]);
  // Without the drop and the give-back, they still pair: Pieter's pick and unassign leave nothing.
  assert.deepEqual(shown([CANCELED_HISTORY[1], picked("g1", step(0), {}, null, "c-zack"), picked("g4", step(11), {}, "c-zack", null)]), ["Pieter set status to Canceled"]);
});
