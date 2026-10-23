import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@prisma/client";
import { toYmd } from "@/lib/dates";
import {
  AssigneeChangedError,
  createNextRepeat,
  isAssignee,
  patchTask,
  setStatus,
  statusSummary,
  TaskChangedError,
  TaskRuleError,
  type Principal,
  type Tx,
} from "./core";

test("a stale change says who moved the task, in one line", () => {
  const err = new TaskChangedError("DONE", "Pieter");
  assert.equal(err.message, "Pieter moved this to Done.");
  assert.equal(err.current, "DONE");
  // The actions' error handling and userMessage() treat it as a rule error.
  assert.ok(err instanceof TaskRuleError);
  assert.equal(new TaskChangedError("IN_PROGRESS", "").message, "Someone moved this to In progress.");
  assert.equal(new TaskChangedError("REVIEW", null).message, "Someone moved this to Review.");
});

test("a stale reassignment says who has the task now, in one line", () => {
  assert.equal(new AssigneeChangedError("Pieter", "Zack Reading").message, "Pieter assigned this to Zack Reading.");
  assert.equal(new AssigneeChangedError("Pieter", null).message, "Pieter unassigned this.");
  assert.equal(new AssigneeChangedError("", "Zack Reading").message, "Someone assigned this to Zack Reading.");
  assert.ok(new AssigneeChangedError(null, null) instanceof TaskRuleError);
});

test("isAssignee: exactly one person, or nobody; a legacy name alone is nobody", () => {
  const zack = { assigneeUserId: null, assigneeContactId: "c-zack" };
  assert.ok(isAssignee(zack, { contactId: "c-zack" }));
  assert.ok(!isAssignee(zack, { contactId: "c-jose" }));
  assert.ok(!isAssignee(zack, null));
  assert.ok(!isAssignee(zack, { userId: "c-zack" }));
  assert.ok(isAssignee({ assigneeUserId: "u-pieter", assigneeContactId: null }, { userId: "u-pieter" }));
  assert.ok(isAssignee({ assigneeUserId: null, assigneeContactId: null }, null));
});

// ---------------------------------------------------------------------------
// patchTask's compare-and-set on the assignee, on a fake transaction
// ---------------------------------------------------------------------------

interface Call {
  model: string;
  op: string;
  args: unknown;
}

const PIETER: Principal = { kind: "staff", userId: "u-pieter", label: "Pieter Louw" };

type CallArgs = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown> };
type Answer = (model: string, op: string, args: CallArgs) => unknown;

/** `answer` overrides a call's result when it returns anything but undefined. */
function fakeTx(row: Record<string, unknown>, answer?: Answer) {
  const calls: Call[] = [];
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
    assigneeUserId: null,
    assigneeContactId: null,
    assigneeName: null,
    assigneeEmail: null,
    ...row,
  };
  const result = (model: string, op: string, args: CallArgs) => {
    const given = answer?.(model, op, args);
    if (given !== undefined) return given;
    if (model === "task" && op === "findUnique") return stored;
    if (model === "task" && op === "update") return { ...stored, ...args.data };
    if (model === "taskEvent" && op === "findFirst") return { actorLabel: "Connor Swofford" };
    if (model === "contact" && op === "findUnique") return { fullName: args.where?.id === "c-zack" ? "Zack Reading" : "Jose Alvarez" };
    if (model === "user" && op === "findUnique") return { name: "Connor Swofford", email: "connor@example.com" };
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany") return { count: 0 };
    return { id: `${model}-${calls.length}` };
  };
  const tx = new Proxy(
    {},
    {
      get(_, model: string) {
        if (model === "then") return undefined;
        if (model === "$executeRaw") {
          return async (sql: TemplateStringsArray, ...values: unknown[]) => {
            calls.push({ model: "$executeRaw", op: sql.join("?"), args: values });
            return 1;
          };
        }
        if (model === "$queryRaw") {
          return async (sql: TemplateStringsArray, ...values: unknown[]) => {
            calls.push({ model: "$queryRaw", op: sql.join("?"), args: values });
            return answer?.("$queryRaw", sql.join("?"), {}) ?? [];
          };
        }
        return new Proxy(
          {},
          {
            get(__, op: string) {
              return async (args: Record<string, unknown> = {}) => {
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

const writes = (calls: Call[]) => calls.filter((c) => /^(create|update|upsert|delete)/.test(c.op) || c.model === "$executeRaw");

test("patchTask: a reassignment from a stale screen is refused, and nothing is written", async () => {
  // The page showed Zack; Connor has since given the job to Jose.
  const { tx, calls } = fakeTx({ assigneeContactId: "c-jose" });
  await assert.rejects(
    patchTask(tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER),
    (err: unknown) => err instanceof AssigneeChangedError && err.message === "Connor assigned this to Jose Alvarez.",
  );
  // The row lock comes first, so a second reassignment waits for the first and then sees it.
  assert.equal(calls[0].model, "$executeRaw");
  assert.match(calls[0].op, /FOR NO KEY UPDATE/);
  assert.deepEqual(
    writes(calls).map((c) => c.model),
    ["$executeRaw"],
    "no task update, no timeline line, no access change",
  );
});

test("patchTask: a stale screen names a name-only holder, and looks for who gave the job to them", async () => {
  // An Asana delta gave the job to someone the load couldn't match, so only the name is stored.
  const { tx, calls } = fakeTx({ assigneeName: "Rae Realtor" });
  await assert.rejects(
    patchTask(tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER),
    (err: unknown) => err instanceof AssigneeChangedError && err.message.endsWith("assigned this to Rae Realtor."),
  );
  // With nobody but a name there's no `to` to match, so any ASSIGNED line is searched.
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((find.args as { where: Record<string, unknown> }).where, { taskId: "t1", kind: "ASSIGNED" });
});

test("patchTask: the refusal credits whoever assigned the current holder", async () => {
  const { tx, calls } = fakeTx({ assigneeContactId: "c-jose" });
  await assert.rejects(patchTask(tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER));
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((find.args as { where: Record<string, unknown> }).where, {
    taskId: "t1",
    kind: "ASSIGNED",
    data: { path: ["to", "contactId"], equals: "c-jose" },
  });
});

test("patchTask: a stale screen that saw a contractor can't unassign the job someone else gave a partner", async () => {
  const { tx } = fakeTx({ assigneeUserId: "u-connor" });
  await assert.rejects(
    patchTask(tx, "t1", { assignee: null, expectedAssignee: { contactId: "c-zack" } }, PIETER),
    (err: unknown) => err instanceof AssigneeChangedError && err.message === "Connor assigned this to Connor Swofford.",
  );
});

test("patchTask: the assignee the screen showed is still there, so the reassignment goes through", async () => {
  const { tx, calls } = fakeTx({ assigneeContactId: "c-zack" });
  const after = await patchTask(tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER);
  assert.equal(after.assigneeUserId, "u-pieter");
  assert.equal(after.assigneeContactId, null);
  const ev = calls.find((c) => c.model === "taskEvent" && c.op === "create")!;
  assert.equal((ev.args as { data: { kind: string } }).data.kind, "ASSIGNED");
  // Zack's automatic access goes with the job (D12).
  const revoke = calls.find((c) => c.model === "taskAccess" && c.op === "updateMany")!;
  assert.deepEqual((revoke.args as { where: unknown }).where, { taskId: "t1", source: "ASSIGNEE", revokedAt: null });
});

test("patchTask: when the task already has the person asked for, a stale screen isn't an error", async () => {
  const { tx, calls } = fakeTx({ assigneeUserId: "u-pieter" });
  const after = await patchTask(tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER);
  assert.equal(after.assigneeUserId, "u-pieter");
  assert.ok(!calls.some((c) => c.model === "task" && c.op === "update"), "nothing to write");
});

test("patchTask: callers that don't say what they saw (system writes) assign as before", async () => {
  const { tx, calls } = fakeTx({ assigneeContactId: "c-jose" });
  const after = await patchTask(tx, "t1", { assignee: { contactId: "c-zack" } }, { kind: "system", label: "Move-in form" });
  assert.equal(after.assigneeContactId, "c-zack");
  assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"));
});

test("patchTask: edits that don't touch the assignee take no lock", async () => {
  const { tx, calls } = fakeTx({});
  await patchTask(tx, "t1", { title: "Hang and tape drywall" }, PIETER);
  assert.ok(!calls.some((c) => c.model === "$executeRaw"));
});

// ---------------------------------------------------------------------------
// Repeats: the next copy's date (decision 14), on the same fake transaction
// ---------------------------------------------------------------------------

const MONTHLY_5 = { freq: "monthly", interval: 1, dayOfMonth: 5 };
const day = (v: string) => new Date(`${v}T00:00:00Z`);

/** A finished repeating task, as createNextRepeat gets it. */
const finished = (over: Record<string, unknown>) =>
  ({
    id: "t1",
    title: "Check if any taxes are due",
    description: null,
    status: "DONE",
    dueDate: null,
    propertyId: null,
    unitLabel: null,
    assigneeUserId: "u-connor",
    assigneeContactId: null,
    assigneeName: null,
    bucket: "General",
    repeatRule: MONTHLY_5,
    repeatSeriesId: "s1",
    createdByUserId: null,
    ...over,
  }) as unknown as Task;

/** The copy the fake transaction was asked to create comes back with id t2. */
const makesCopy: Answer = (model, op, args) => (model === "task" && op === "create" ? { id: "t2", ...args.data } : undefined);
const copyDue = (calls: Call[]) => {
  const made = calls.find((c) => c.model === "task" && c.op === "create");
  return made ? toYmd((made.args as { data: { dueDate: Date | null } }).data.dueDate) : undefined;
};

test("createNextRepeat: a late repeat's copy lands on the first pinned day on or after today", async () => {
  const { tx, calls } = fakeTx({}, makesCopy);
  const next = await createNextRepeat(tx, finished({ dueDate: day("2026-07-05") }), PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.equal(next, "t2");
  assert.equal(copyDue(calls), "2026-11-05", "due Jul 5, finished Oct 23: Nov 5, not Aug 5");
  const line = calls.find((c) => c.model === "taskEvent" && c.op === "create" && (c.args as { data: { kind: string } }).data.kind === "REPEAT_CREATED");
  assert.deepEqual((line!.args as { data: { data: unknown } }).data.data, { next: "t2", due: "2026-11-05" });
});

test("createNextRepeat: today is Buffalo's, not the server's UTC date", async () => {
  // 10pm Friday Oct 23 in Buffalo is already Saturday in UTC.
  const { tx, calls } = fakeTx({}, makesCopy);
  await createNextRepeat(tx, finished({ dueDate: day("2026-10-16"), repeatRule: { freq: "weeks", interval: 1 } }), PIETER, new Date("2026-10-24T02:00:00Z"));
  assert.equal(copyDue(calls), "2026-10-23");
});

test("createNextRepeat: on time, the usual next date; a pinned weekday holds", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  let fake = fakeTx({}, makesCopy);
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-23"), repeatRule: { freq: "days", interval: 1 } }), PIETER, now);
  assert.equal(copyDue(fake.calls), "2026-10-24");
  // Every week on Monday; this copy was moved from Monday Oct 19 to Thursday Oct 22.
  fake = fakeTx({}, makesCopy);
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-22"), repeatRule: { freq: "weeks", interval: 1, weekday: 1 } }), PIETER, now);
  assert.equal(copyDue(fake.calls), "2026-10-26");
  // Undated: from the day it was finished.
  fake = fakeTx({}, makesCopy);
  await createNextRepeat(fake.tx, finished({ dueDate: null }), PIETER, now);
  assert.equal(copyDue(fake.calls), "2026-11-05");
});

/** A fake transaction whose finished task is a copy: its CREATED line and the REPEAT_CREATED line on the task that made it. */
const copyOf = (created: Record<string, unknown>, made?: Record<string, unknown>): Answer => (model, op, args) => {
  if (model === "taskEvent" && op === "findFirst" && args.where?.kind === "CREATED") return { data: created };
  if (model === "taskEvent" && op === "findFirst" && args.where?.kind === "REPEAT_CREATED" && args.where?.taskId === "t0") return made ? { data: made } : null;
  return makesCopy(model, op, args);
};
const createdLine = (calls: Call[]) =>
  calls.find((c) => c.model === "taskEvent" && c.op === "create" && (c.args as { data: { kind: string } }).data.kind === "CREATED")?.args as
    | { data: { taskId: string; data: unknown } }
    | undefined;

test("createNextRepeat: a pinned weekly copy steps from the date the series gave it, not its moved date", async () => {
  const mondays = { freq: "weeks", interval: 1, weekday: 1 };
  // The Mon Oct 26 copy, moved to the Saturday before and finished then: the next Monday a week on.
  let fake = fakeTx({}, copyOf({ repeatOf: "t0", due: "2026-10-26" }));
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-24"), repeatRule: mondays }), PIETER, new Date("2026-10-24T15:00:00Z"));
  assert.equal(copyDue(fake.calls), "2026-11-02");
  // Every 2 weeks: the Nov 2 copy moved early to Fri Oct 30 keeps the schedule.
  fake = fakeTx({}, copyOf({ repeatOf: "t0", due: "2026-11-02" }));
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-30"), repeatRule: { ...mondays, interval: 2 } }), PIETER, new Date("2026-10-30T15:00:00Z"));
  assert.equal(copyDue(fake.calls), "2026-11-16");
  // Moved later, to Thu Oct 29, and finished then: still the next slot.
  fake = fakeTx({}, copyOf({ repeatOf: "t0", due: "2026-10-26" }));
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-29"), repeatRule: mondays }), PIETER, new Date("2026-10-29T15:00:00Z"));
  assert.equal(copyDue(fake.calls), "2026-11-02");
});

test("createNextRepeat: an older copy's slot comes from the line that made it; the new copy keeps its own", async () => {
  const mondays = { freq: "weeks", interval: 1, weekday: 1 };
  const { tx, calls } = fakeTx({}, copyOf({ repeatOf: "t0" }, { next: "t1", due: "2026-10-26" }));
  await createNextRepeat(tx, finished({ dueDate: day("2026-10-24"), repeatRule: mondays }), PIETER, new Date("2026-10-24T15:00:00Z"));
  assert.equal(copyDue(calls), "2026-11-02");
  const asked = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst" && (c.args as CallArgs).where?.kind === "REPEAT_CREATED" && (c.args as CallArgs).where?.taskId === "t0");
  assert.deepEqual((asked!.args as CallArgs).where?.data, { path: ["next"], equals: "t1" }, "the line that made this copy");
  assert.deepEqual(createdLine(calls)?.data.data, { repeatOf: "t1", due: "2026-11-02" }, "the next copy's CREATED line keeps its date");
});

test("createNextRepeat: a slot off the pinned weekday (re-pinned since) steps from the due date", async () => {
  // Re-pinned from Monday to Wednesday and moved to Wed Oct 28: Nov 4 next, not Oct 28 again.
  const { tx, calls } = fakeTx({}, copyOf({ repeatOf: "t0", due: "2026-10-26" }));
  await createNextRepeat(tx, finished({ dueDate: day("2026-10-28"), repeatRule: { freq: "weeks", interval: 1, weekday: 3 } }), PIETER, new Date("2026-10-28T15:00:00Z"));
  assert.equal(copyDue(calls), "2026-11-04");
});

test("createNextRepeat: a copy an earlier finish made is reused, and nothing is written", async () => {
  const { tx, calls } = fakeTx({}, (model, op, args) => {
    if (model === "taskEvent" && op === "findFirst") return { id: "e1", data: { next: "t2", due: "2026-08-05" } };
    if (model === "task" && op === "findUnique" && args.where?.id === "t2") return { id: "t2" };
    return undefined;
  });
  const next = await createNextRepeat(tx, finished({ dueDate: day("2026-07-05") }), PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.equal(next, "t2");
  assert.deepEqual(writes(calls), [], "no second copy, no second email");
});

test("setStatus: finishing a repeat says when the next one is due; Undo takes the untouched copy back", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  let made: Record<string, unknown> | null = null;
  const done = fakeTx({ status: "OPEN", dueDate: day("2026-07-05"), repeatRule: MONTHLY_5, repeatSeriesId: "s1" }, (model, op, args) => {
    if (model === "task" && op === "create") return (made = { id: "t2", ...args.data });
    if (model === "task" && op === "findUnique" && args.where?.id === "t2") return made;
    return undefined;
  });
  const result = await setStatus(done.tx, "t1", "DONE", PIETER, { expected: "OPEN" }, now);
  assert.equal(result.nextTaskId, "t2");
  assert.equal(result.nextDue, "2026-11-05");

  // The toast's Undo: back to To do, expecting Done.
  const undo = fakeTx({ status: "DONE", dueDate: day("2026-07-05"), repeatRule: MONTHLY_5, repeatSeriesId: "s1" }, (model, op, args) => {
    if (model === "taskEvent" && op === "findFirst") return { id: "e1", data: { next: "t2", due: "2026-11-05" } };
    if (model === "task" && op === "findUnique" && args.where?.id === "t2") {
      return args.select?.status
        ? { status: "OPEN", appEditedAt: null, asanaId: null, events: [{ kind: "CREATED" }], _count: { attachments: 0, readStates: 0, checklist: 0 } }
        : { id: "t2" };
    }
    if (model === "$queryRaw" && op.includes('FROM "Task"')) return [{ id: "t2" }];
    return undefined;
  });
  const back = await setStatus(undo.tx, "t1", "OPEN", PIETER, { expected: "DONE" }, now);
  assert.equal(back.nextTaskId, null);
  assert.equal(back.nextDue, null);
  const deleted = undo.calls.filter((c) => c.op === "delete").map((c) => `${c.model}:${(c.args as { where: { id: string } }).where.id}`);
  assert.deepEqual(deleted, ["task:t2", "taskEvent:e1"], "the copy and its REPEAT_CREATED line go");
});

test("setStatus: a stale Undo (the task moved on from Done) changes nothing", async () => {
  const { tx, calls } = fakeTx({ status: "IN_PROGRESS" });
  await assert.rejects(
    setStatus(tx, "t1", "OPEN", PIETER, { expected: "DONE" }),
    (err: unknown) => err instanceof TaskChangedError && err.current === "IN_PROGRESS",
  );
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "only the row lock");
});

test("status email lines: Approve and the contractor's Start have their own words (BCONTRACT-008)", () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const base = { title: "Cabinet install", scheduledFor: null };
  assert.equal(statusSummary({ ...base, from: "REVIEW", to: "DONE", actor: "staff" }, now), 'approved "Cabinet install"');
  assert.equal(statusSummary({ ...base, from: "OPEN", to: "DONE", actor: "staff" }, now), 'set "Cabinet install" to done');
  assert.equal(statusSummary({ ...base, from: "SCHEDULED", to: "IN_PROGRESS", actor: "contractor" }, now), 'started "Cabinet install"');
  assert.equal(statusSummary({ ...base, from: "SCHEDULED", to: "IN_PROGRESS", actor: "staff" }, now), 'set "Cabinet install" to in progress');
  assert.equal(statusSummary({ ...base, from: "REVIEW", to: "IN_PROGRESS", actor: "staff", note: "Level it" }, now), 'sent "Cabinet install" back: Level it');
  assert.equal(statusSummary({ ...base, from: "IN_PROGRESS", to: "REVIEW", actor: "contractor" }, now), 'marked "Cabinet install" done');
  assert.equal(
    statusSummary({ ...base, from: "OPEN", to: "SCHEDULED", actor: "staff", scheduledFor: new Date("2026-10-29T00:00:00Z") }, now),
    'scheduled "Cabinet install" for Thu, Oct 29',
  );
});
