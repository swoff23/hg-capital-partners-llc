import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@prisma/client";
import { toYmd } from "@/lib/dates";
import { recentAssigneeKeys } from "./assignee-people";
import { copyOrigin } from "./repeat";
import {
  AssigneeChangedError,
  NotesChangedError,
  addChecklistItem,
  addComment,
  approvalEmailRefusal,
  changedBy,
  createNextRepeat,
  createTask,
  deleteComment,
  editComment,
  isAssignee,
  patchTask,
  renameTaskUnits,
  restoreComment,
  setChecklistItem,
  setStatus,
  statusSummary,
  TaskChangedError,
  TaskRuleError,
  undoApproval,
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

test("patchTask: a task deleted elsewhere is refused, never a quiet success", async () => {
  // The service no longer returns early on a missing task, so this refusal is what a stale rename hears.
  const { tx, calls } = fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await assert.rejects(patchTask(tx, "t1", { title: "Hang and tape drywall" }, PIETER), (err: unknown) => err instanceof TaskRuleError && err.message === "That task no longer exists.");
  assert.deepEqual(writes(calls), []);
});

// ---------------------------------------------------------------------------
// patchTask's compare-and-set on the notes
// ---------------------------------------------------------------------------

const UPDATED = new Date("2026-10-27T18:14:00Z");
/** The notes line that saved what the task holds now, by `by`. */
const notesLine = (by: Record<string, unknown>): Answer => (model, op, args) =>
  model === "taskEvent" && op === "findFirst" && args.where?.kind === "NOTES" ? { createdAt: UPDATED, ...by } : undefined;

test("patchTask: a notes save from a stale screen is refused, names who saved them, and writes nothing", async () => {
  // Pieter's screen loaded "Old words"; Connor has since saved new notes.
  const { tx, calls } = fakeTx({ description: "Connor's newer notes", updatedAt: UPDATED }, notesLine({ actorLabel: "Connor Swofford", actorUserId: "u-connor" }));
  await assert.rejects(
    patchTask(tx, "t1", { description: "Old words, and a line Pieter added", expectedDescription: "Old words" }, PIETER),
    (err: unknown) =>
      err instanceof NotesChangedError &&
      err instanceof TaskRuleError &&
      err.by === "Connor" &&
      !err.mine &&
      err.current === "Connor's newer notes" &&
      err.at.getTime() === UPDATED.getTime(),
  );
  // The row lock comes first, so two saves at once run one after the other.
  assert.equal(calls[0].model, "$executeRaw");
  assert.match(calls[0].op, /FOR NO KEY UPDATE/);
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "no task update, no notes line, no email");
});

test("patchTask: notes still as the screen loaded them save; notes that already say the same aren't a conflict", async () => {
  // Stored trimmed, compared trimmed: the field's own whitespace never reads as someone else's change.
  let fake = fakeTx({ description: "Old words" });
  const after = await patchTask(fake.tx, "t1", { description: "New words", expectedDescription: "Old words \n" }, PIETER);
  assert.equal(after.description, "New words");
  assert.ok(fake.calls.some((c) => c.model === "taskEvent" && c.op === "create"));
  // Empty notes load as "" and are stored as null.
  fake = fakeTx({ description: null });
  assert.equal((await patchTask(fake.tx, "t1", { description: "First notes", expectedDescription: null }, PIETER)).description, "First notes");
  fake = fakeTx({ description: "Same words" });
  await patchTask(fake.tx, "t1", { description: "Same words", expectedDescription: "Older words" }, PIETER);
  assert.ok(!fake.calls.some((c) => c.model === "task" && c.op === "update"), "nothing to write");
  // A caller that doesn't say what it loaded (Restore from View previous, the system) saves as before, with no lock.
  fake = fakeTx({ description: "Connor's newer notes" });
  await patchTask(fake.tx, "t1", { description: "Restored words" }, PIETER);
  assert.ok(!fake.calls.some((c) => c.model === "$executeRaw"));
  assert.ok(fake.calls.some((c) => c.model === "task" && c.op === "update"));
});

test("a stale change made in your own other tab says You, not your first name", async () => {
  // Status: Pieter moved it to Done in another tab.
  let fake = fakeTx({ status: "DONE" }, (model, op) =>
    model === "taskEvent" && op === "findFirst" ? { actorLabel: "Pieter Louw", actorUserId: "u-pieter", actorContactId: null } : undefined,
  );
  await assert.rejects(setStatus(fake.tx, "t1", "OPEN", PIETER, { expected: "IN_PROGRESS" }), (err: unknown) => err instanceof TaskChangedError && err.message === "You moved this to Done.");
  // Someone else with the same first name is still named.
  fake = fakeTx({ status: "DONE" }, (model, op) =>
    model === "taskEvent" && op === "findFirst" ? { actorLabel: "Pieter Smith", actorUserId: "u-pieter-2", actorContactId: null } : undefined,
  );
  await assert.rejects(setStatus(fake.tx, "t1", "OPEN", PIETER, { expected: "IN_PROGRESS" }), (err: unknown) => err instanceof TaskChangedError && err.message === "Pieter moved this to Done.");
  // Assignee.
  fake = fakeTx({ assigneeContactId: "c-jose" }, (model, op, args) =>
    model === "taskEvent" && op === "findFirst" && args.where?.kind === "ASSIGNED" ? { actorLabel: "Pieter Louw", actorUserId: "u-pieter" } : undefined,
  );
  await assert.rejects(
    patchTask(fake.tx, "t1", { assignee: { userId: "u-pieter" }, expectedAssignee: { contactId: "c-zack" } }, PIETER),
    (err: unknown) => err instanceof AssigneeChangedError && err.message === "You assigned this to Jose Alvarez.",
  );
  // Notes: mine, so the field names nobody.
  fake = fakeTx({ description: "From my other tab" }, notesLine({ actorLabel: "Pieter Louw", actorUserId: "u-pieter" }));
  await assert.rejects(patchTask(fake.tx, "t1", { description: "x", expectedDescription: "y" }, PIETER), (err: unknown) => err instanceof NotesChangedError && err.mine && err.by === null);
  // A contractor is "You" by contact.
  assert.equal(changedBy({ kind: "contractor", contactId: "c-zack", label: "Zack Reading" }, { actorLabel: "Zack Reading", actorContactId: "c-zack" }), "You");
  assert.equal(changedBy({ kind: "contractor", contactId: "c-zack", label: "Zack Reading" }, { actorLabel: "Zack Reading", actorUserId: "u-x" }), "Zack");
  assert.equal(changedBy(PIETER, null), null);
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

test("createNextRepeat: a yearly rule finished on Feb 29 hands its copies the leap day, so 2032 is Feb 29 again", async () => {
  const copyRule = (calls: Call[]) => (calls.find((c) => c.model === "task" && c.op === "create")!.args as { data: { repeatRule: unknown } }).data.repeatRule;
  // A rule saved before the pin, as the tester's was: the copy carries the pin from here on.
  const rule: unknown = { freq: "yearly", interval: 1 };
  let due = "2028-02-29";
  const dues: string[] = [];
  for (let i = 0; i < 4; i++) {
    const fake = fakeTx({}, makesCopy);
    // Each copy is finished on its due date.
    await createNextRepeat(fake.tx, finished({ dueDate: day(due), repeatRule: i === 0 ? rule : { freq: "yearly", interval: 1, dayOfMonth: 29 } }), PIETER, new Date(`${due}T15:00:00Z`));
    due = copyDue(fake.calls)!;
    dues.push(due);
    assert.deepEqual(copyRule(fake.calls), { freq: "yearly", interval: 1, dayOfMonth: 29 });
  }
  assert.deepEqual(dues, ["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  // Any other yearly date is left unpinned.
  const fake = fakeTx({}, makesCopy);
  await createNextRepeat(fake.tx, finished({ dueDate: day("2026-10-30"), repeatRule: { freq: "yearly", interval: 1 } }), PIETER, new Date("2026-10-30T15:00:00Z"));
  assert.deepEqual(copyRule(fake.calls), { freq: "yearly", interval: 1 });
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

test("createTask: an assignee given at creation rides on the CREATED line, so the picker's Recent rows see it", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const made = async (input: Parameters<typeof createTask>[1]) => {
    const fake = fakeTx({}, makesCopy);
    await createTask(fake.tx, input, PIETER, now);
    return createdLine(fake.calls)?.data.data;
  };
  // Shaped as an ASSIGNED line's `to`, both keys always there.
  const partner = await made({ title: "Hang drywall", assignee: { userId: "u-connor" } });
  assert.deepEqual(partner, { to: { userId: "u-connor", contactId: null } });
  const contractor = await made({ title: "Hang drywall", assignee: { contactId: "c-zack" } });
  assert.deepEqual(contractor, { to: { userId: null, contactId: "c-zack" } });
  // No assignee, or only a legacy name: the line carries nothing, as before.
  assert.deepEqual(await made({ title: "Hang drywall" }), {});
  assert.deepEqual(await made({ title: "Hang drywall", assigneeName: "Brandon" }), {});

  // Read back the way the picker reads it, newest first.
  const offered = new Set(["u:u-connor", "c:c-zack"]);
  const events = [{ data: {} }, { data: contractor }, { data: { repeatOf: "t0", due: "2026-10-26" } }, { data: partner }];
  assert.deepEqual(recentAssigneeKeys(events, offered), ["c:c-zack", "u:u-connor"]);
  // And a task made with an assignee is no repeat copy, so it has no slot.
  assert.equal(copyOrigin(contractor), null);
});

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

// ---------------------------------------------------------------------------
// Comments: a Retry never posts twice, edit, delete and restore (activity 2.5, 2.7)
// ---------------------------------------------------------------------------

const ZACK: Principal = { kind: "contractor", contactId: "c-zack", label: "Zack Reading" };
const accessOk = (model: string, op: string): unknown =>
  model === "taskAccess" && op === "findUnique" ? { revokedAt: null, contact: { active: true, portalAccount: { status: "ACTIVE" } } } : undefined;
const created = (calls: Call[], model: string) => calls.filter((c) => c.model === model && c.op === "create");
/** The outbox lines a run queued: the JSON each insert carried. */
const queued = (calls: Call[]) =>
  calls
    .filter((c) => c.model === "$executeRaw" && c.op.includes("NotificationOutbox"))
    .map((c) => JSON.parse((c.args as unknown[]).find((v) => typeof v === "string" && v.startsWith("{")) as string) as Record<string, unknown>);

test("addComment: a second send with the same clientId returns the first and writes nothing", async () => {
  const first = { id: "ev1", kind: "COMMENT", taskId: "t1", body: "Hello" };
  const { tx, calls } = fakeTx({ assigneeContactId: "c-zack" }, (model, op) => (model === "taskEvent" && op === "findFirst" ? first : undefined));
  const out = await addComment(tx, "t1", { body: "Hello", visibility: "SHARED", clientId: "send-1" }, PIETER);
  assert.equal(out, first);
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "the lock, and no event, no link, no edit stamp, no email");
  // Locked first, with NO KEY UPDATE (FOR UPDATE would deadlock against the key-share locks of the inserts).
  const lock = calls.find((c) => c.model === "$executeRaw")!;
  assert.match(lock.op, /FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/);
  assert.doesNotMatch(lock.op, /FOR UPDATE/);
  // Looked up by task, this person and the id the browser made.
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((find.args as { where: unknown }).where, { taskId: "t1", kind: "COMMENT", actorUserId: "u-pieter", data: { path: ["clientId"], equals: "send-1" } });
});

test("addComment: a first send stores its clientId, takes the lock before the lookup, and queues the email with the event's id", async () => {
  const { tx, calls } = fakeTx({ assigneeContactId: "c-zack" }, (model, op, args) => {
    if (model === "taskEvent" && op === "findFirst") return null;
    if (model === "portalAccount" && op === "findUnique") return { status: "ACTIVE" };
    if (model === "taskEvent" && op === "create") return { id: "ev9", ...args.data };
    return undefined;
  });
  await addComment(tx, "t1", { body: "  Doors are in  ", visibility: "SHARED", clientId: "send-1" }, PIETER);
  const order = calls.map((c) => `${c.model}.${c.op.startsWith("SELECT") ? "lock" : c.op.startsWith("INSERT") ? "insert" : c.op}`);
  assert.ok(order.indexOf("$executeRaw.lock") < order.indexOf("taskEvent.findFirst"), "locked, then looked up");
  assert.ok(order.indexOf("taskEvent.findFirst") < order.indexOf("taskEvent.create"));
  const ev = created(calls, "taskEvent")[0].args as { data: { data: unknown; body: string; visibility: string; audienceContactId: string | null } };
  assert.deepEqual(ev.data.data, { clientId: "send-1" });
  assert.equal(ev.data.body, "Doors are in");
  assert.equal(ev.data.audienceContactId, "c-zack", "addressed to the contractor assigned now");
  const item = queued(calls)[0];
  assert.equal(item.kind, "COMMENT");
  assert.equal(item.eventId, "ev9");
});

test("addComment: a Retry of photos alone that did post (no unposted files left to name) returns the first send", async () => {
  const first = { id: "ev1", kind: "COMMENT", taskId: "t1", body: null };
  const { tx, calls } = fakeTx({ status: "IN_PROGRESS" }, (model, op) => accessOk(model, op) ?? (model === "taskEvent" && op === "findFirst" ? first : undefined));
  const out = await addComment(tx, "t1", { body: "", attachmentIds: [], clientId: "send-1" }, ZACK);
  assert.equal(out, first);
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "only the lock");
});

test("addComment: an empty send with a clientId and no first send is still refused, after the lookup and before any write", async () => {
  const { tx, calls } = fakeTx({ status: "IN_PROGRESS" }, (model, op) => accessOk(model, op) ?? (model === "taskEvent" && op === "findFirst" ? null : undefined));
  await assert.rejects(addComment(tx, "t1", { body: "  ", attachmentIds: [], clientId: "send-1" }, ZACK), /Write something or add a photo/);
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "only the lock");
  // Without a clientId it is refused before anything is read.
  const plain = fakeTx({});
  await assert.rejects(addComment(plain.tx, "t1", { body: "", attachmentIds: [] }, PIETER), /Write something or add a photo/);
  assert.equal(plain.calls.length, 0);
});

test("addComment: a send with no clientId takes the task lock too, before it reads the task or links a file", async () => {
  // The portal's leave-page flush and a batch post send no clientId. Linking the files first and locking the task
  // after would deadlock against a staff Remove, which takes the task and then the file (40P01).
  const { tx, calls } = fakeTx({}, (model, op) => (model === "taskAttachment" && op === "updateMany" ? { count: 1 } : undefined));
  await addComment(tx, "t1", { body: "", visibility: "SHARED", attachmentIds: ["a1"] }, PIETER);
  const at = (model: string, op: string) => calls.findIndex((c) => c.model === model && c.op === op);
  assert.equal(calls[0].model, "$executeRaw", "the lock comes before anything is read");
  assert.match(calls[0].op, /^SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.deepEqual(calls[0].args, ["t1"]);
  assert.ok(at("task", "findUnique") > 0, "the task is read under the lock");
  assert.ok(at("taskAttachment", "updateMany") > at("task", "findUnique"));
  assert.ok(at("task", "update") > at("taskAttachment", "updateMany"));
  // Nothing to dedupe: no lookup, and the event carries no clientId.
  assert.ok(!calls.some((c) => c.model === "taskEvent" && c.op === "findFirst"));
  assert.deepEqual((created(calls, "taskEvent")[0].args as { data: { data: unknown } }).data.data, {});
  assert.equal(calls.filter((c) => c.model === "$executeRaw" && c.op.includes("FOR NO KEY UPDATE")).length, 1, "one lock, not two");
});

test("addComment: a contractor is refused on a closed job or without access before any write, and without access before the clientId lookup", async () => {
  // The status is read under the lock, so a job approved a moment ago is closed to the post that waited on it.
  const closed = fakeTx({ status: "DONE" }, (model, op) => accessOk(model, op) ?? (model === "taskEvent" && op === "findFirst" ? null : undefined));
  // The portal's batch post answers on these exact words (portal/job-uploads.ts postJobBatch).
  await assert.rejects(addComment(closed.tx, "t1", { body: "Hi", clientId: "c1" }, ZACK), /^TaskRuleError: This job is closed\.$/);
  assert.deepEqual(writes(closed.calls).map((c) => c.model), ["$executeRaw"], "only the lock");
  const noAccess = fakeTx({ status: "OPEN" }, (model, op) => (model === "taskEvent" && op === "findFirst" ? { id: "ev1", kind: "COMMENT" } : undefined));
  await assert.rejects(addComment(noAccess.tx, "t1", { body: "Hi", clientId: "c1" }, ZACK), /don't have access/);
  assert.deepEqual(writes(noAccess.calls).map((c) => c.model), ["$executeRaw"], "only the lock");
  assert.ok(!noAccess.calls.some((c) => c.model === "taskEvent" && c.op === "findFirst"), "an earlier post is never handed to someone who lost the job");
  // Without a clientId there is nothing to look for: a closed job refuses at once.
  const plain = fakeTx({ status: "DONE" }, accessOk);
  await assert.rejects(addComment(plain.tx, "t1", { body: "Hi" }, ZACK), /^TaskRuleError: This job is closed\.$/);
  assert.ok(!plain.calls.some((c) => c.model === "taskEvent" && c.op === "findFirst"));
});

test("addComment: a contractor's Retry of an update that did post gets it back after the job closed, looked up after the access check", async () => {
  // Zack's send posted, its answer never arrived, and Connor approved the job before Zack tapped Retry.
  const first = { id: "ev1", kind: "COMMENT", taskId: "t1", body: "Uppers in" };
  for (const status of ["DONE", "CANCELED"]) {
    const { tx, calls } = fakeTx({ status }, (model, op) => accessOk(model, op) ?? (model === "taskEvent" && op === "findFirst" ? first : undefined));
    const out = await addComment(tx, "t1", { body: "Uppers in", clientId: "send-1" }, ZACK);
    assert.equal(out, first, status);
    assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "only the lock: no second post, no email");
    const at = (model: string, op: string) => calls.findIndex((c) => c.model === model && c.op === op);
    assert.ok(at("taskAccess", "findUnique") >= 0 && at("taskAccess", "findUnique") < at("taskEvent", "findFirst"), "access first");
    const find = calls[at("taskEvent", "findFirst")].args as { where: Record<string, unknown> };
    assert.equal(find.where.actorContactId, "c-zack", "only Zack's own post");
  }
});

test("addComment: a task deleted while the send waited is refused under the lock, before any write", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await assert.rejects(addComment(tx, "t1", { body: "Hi" }, PIETER), /no longer exists/);
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"]);
});

test("notify queues the partners' rows in user id order", async () => {
  const { tx, calls } = fakeTx({ status: "OPEN" }, (model, op) => accessOk(model, op) ?? (model === "user" && op === "findMany" ? [{ id: "u-a" }, { id: "u-b" }] : undefined));
  await addComment(tx, "t1", { body: "On my way" }, ZACK);
  const staff = calls.find((c) => c.model === "user" && c.op === "findMany")!;
  assert.deepEqual((staff.args as { orderBy?: unknown }).orderBy, { id: "asc" });
  assert.deepEqual(
    calls.filter((c) => c.model === "$executeRaw" && c.op.includes("NotificationOutbox")).map((c) => (c.args as unknown[])[2]),
    ["u-a", "u-b"],
  );
});

test("addComment: a contractor's comment is always Shared, found by their contact", async () => {
  const { tx, calls } = fakeTx({ status: "OPEN" }, (model, op, args) => {
    if (model === "taskEvent" && op === "findFirst") return null;
    return accessOk(model, op) ?? (model === "taskEvent" && op === "create" ? { id: "ev1", ...args.data } : undefined);
  });
  await addComment(tx, "t1", { body: "On my way", visibility: "INTERNAL", clientId: "c1" }, ZACK);
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((find.args as { where: { actorContactId: string } }).where.actorContactId, "c-zack");
  assert.equal((created(calls, "taskEvent")[0].args as { data: { visibility: string } }).data.visibility, "SHARED");
});

test("addComment keeps its link guard: only this task's files nobody has posted, and a files-only post that lost them is refused", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => (model === "taskAttachment" && op === "updateMany" ? { count: 0 } : undefined));
  await assert.rejects(addComment(tx, "t1", { body: "", visibility: "SHARED", attachmentIds: ["a1", "a2"] }, PIETER), /Write something or add a photo/);
  const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!;
  assert.deepEqual((link.args as { where: unknown }).where, { id: { in: ["a1", "a2"] }, taskId: "t1", eventId: null });
  assert.ok(!calls.some((c) => c.model === "task" && c.op === "update"), "refused before the edit stamp, so the transaction rolls back");
});

const MINE = { id: "ev1", taskId: "t1", kind: "COMMENT", visibility: "SHARED", audienceContactId: "c-zack", actorUserId: "u-pieter", actorContactId: null, source: "APP", body: "Original", deletedAt: null };
/** A fake transaction that holds one comment. */
const withComment = (over: Record<string, unknown> = {}, more?: Answer) =>
  fakeTx({}, (model, op, args) => {
    if (model === "taskEvent" && op === "findUnique") return { ...MINE, ...over };
    if (model === "taskEvent" && op === "update") return { ...MINE, ...over, ...args.data };
    return more?.(model, op, args) ?? accessOk(model, op);
  });

test("editComment: writes the words and editedAt and nothing else about the comment", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const { tx, calls } = withComment({}, (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined));
  const out = await editComment(tx, "ev1", { body: "  Better words " }, PIETER, now);
  assert.equal(out.body, "Better words");
  const update = calls.find((c) => c.model === "taskEvent" && c.op === "update")!;
  // Never visibility, the audience, the actor, the source or the time it was written: those are fixed when it is.
  assert.deepEqual(update.args, { where: { id: "ev1" }, data: { body: "Better words", editedAt: now } });
  // The task row is locked first and the comment's second, as every writer on a task takes the task first; no email
  // is queued (the drain re-reads).
  const locks = calls.filter((c) => c.model === "$executeRaw");
  assert.equal(locks.length, 2);
  assert.match(locks[0].op, /FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/);
  assert.deepEqual(locks[0].args, ["t1"]);
  assert.match(locks[1].op, /"TaskEvent" WHERE "id" = \? FOR NO KEY UPDATE/);
  assert.ok(!calls.some((c) => c.op.includes("NotificationOutbox")));
});

test("edit, delete and restore take the task row before the comment's, then the files (a removed photo on it never deadlocks)", async () => {
  // removeAttachment and takeBackContractorPost lock the task row first; a comment change that locked its own row
  // first would wait on theirs while they waited on it (Postgres 40P01), so every change here follows them.
  const count: Answer = (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined);
  const gone = new Date("2026-10-23T15:00:00Z");
  const rounds = [
    ["edit", withComment({}, count), (tx: Tx) => editComment(tx, "ev1", { body: "New words" }, PIETER)],
    ["delete", withComment(), (tx: Tx) => deleteComment(tx, "ev1", PIETER)],
    ["restore", withComment({ deletedAt: gone }), (tx: Tx) => restoreComment(tx, "ev1", PIETER)],
  ] as const;
  for (const [name, { tx, calls }, run] of rounds) {
    await run(tx);
    const order = calls.flatMap((c, n) => (c.model === "$executeRaw" ? [[n, /FROM "Task" /.test(c.op) ? "task" : "comment"] as const] : []));
    assert.deepEqual(order.map(([, which]) => which), ["task", "comment"], `${name}: the task row, then the comment's`);
    const firstWrite = calls.findIndex((c) => /^(create|update|upsert|delete)/.test(c.op));
    assert.ok(order[1][0] < firstWrite, `${name}: both locks come before any write`);
    // Nothing but a read can come before the task lock: the read that names the task takes no lock.
    assert.ok(calls.slice(0, order[0][0]).every((c) => c.model === "taskEvent" && c.op === "findUnique"), `${name}: only the read that names the task first`);
  }
});

test("a comment that does not exist is refused before any lock", async () => {
  const none = fakeTx({});
  await assert.rejects(deleteComment(none.tx, "ghost", PIETER), /no longer exists/);
  assert.ok(!none.calls.some((c) => c.model === "$executeRaw"));
});

test("editComment: the same text writes nothing; empty text with no files is refused", async () => {
  const same = withComment({}, (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined));
  await editComment(same.tx, "ev1", { body: "Original " }, PIETER);
  assert.deepEqual(writes(same.calls).map((c) => c.model), ["$executeRaw", "$executeRaw"], "only the two locks");
  const empty = withComment({}, (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined));
  await assert.rejects(editComment(empty.tx, "ev1", { body: "   " }, PIETER), /Add some text, or delete the comment/);
  // A comment that still has a file may lose its words.
  const files = withComment({}, (m, op) => (m === "taskAttachment" && op === "count" ? 2 : undefined));
  assert.equal((await editComment(files.tx, "ev1", { body: "" }, PIETER)).body, null);
  await assert.rejects(editComment(files.tx, "ev1", { body: "x".repeat(20_001) }, PIETER), /20,000/);
});

test("editComment: files added with the edit take the comment's own visibility and audience", async () => {
  const { tx, calls } = withComment({ visibility: "INTERNAL", audienceContactId: null }, (m, op) => (m === "taskAttachment" && op === "count" ? 0 : m === "taskAttachment" && op === "updateMany" ? { count: 1 } : undefined));
  await editComment(tx, "ev1", { body: "With a file", attachmentIds: ["a1"] }, PIETER);
  const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!;
  assert.deepEqual(link.args, { where: { id: { in: ["a1"] }, taskId: "t1", eventId: null }, data: { eventId: "ev1", visibility: "INTERNAL", audienceContactId: null } });
});

test("edit, delete and restore are for the author only, on app and portal comments, never imported ones", async () => {
  const count: Answer = (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined);
  const other = { actorUserId: "u-connor" };
  await assert.rejects(editComment(withComment(other, count).tx, "ev1", { body: "x" }, PIETER), /your own comments/);
  await assert.rejects(deleteComment(withComment(other).tx, "ev1", PIETER), /your own comments/);
  await assert.rejects(restoreComment(withComment({ ...other, deletedAt: new Date() }).tx, "ev1", PIETER), /your own comments/);
  // A partner's mapped Asana comment carries actorUserId too, but it is imported history.
  const imported = { source: "ASANA", asanaStoryGid: "s1" };
  await assert.rejects(editComment(withComment(imported, count).tx, "ev1", { body: "x" }, PIETER), /your own comments/);
  await assert.rejects(deleteComment(withComment(imported).tx, "ev1", PIETER), /your own comments/);
  // Not a comment, not there, already deleted.
  await assert.rejects(editComment(withComment({ kind: "STATUS" }, count).tx, "ev1", { body: "x" }, PIETER), /no longer exists/);
  await assert.rejects(deleteComment(fakeTx({}).tx, "ev1", PIETER), /no longer exists/);
  await assert.rejects(editComment(withComment({ deletedAt: new Date() }, count).tx, "ev1", { body: "x" }, PIETER), /was deleted/);
  await assert.rejects(deleteComment(withComment({ deletedAt: new Date() }).tx, "ev1", PIETER), /your own comments|deleted/);
});

test("a contractor changes only their own comment, and only with live access", async () => {
  const mine = { actorUserId: null, actorContactId: "c-zack", source: "PORTAL" };
  const ok = withComment(mine, (m, op) => (m === "taskAttachment" && op === "count" ? 0 : undefined));
  assert.equal((await editComment(ok.tx, "ev1", { body: "Edited" }, ZACK)).body, "Edited");
  const other = withComment({ ...mine, actorContactId: "c-jose" });
  await assert.rejects(deleteComment(other.tx, "ev1", ZACK), /your own comments/);
  const revoked = fakeTx({}, (model, op, args) => {
    if (model === "taskEvent" && op === "findUnique") return { ...MINE, ...mine };
    if (model === "taskAccess" && op === "findUnique") return { revokedAt: new Date(), contact: { active: true, portalAccount: { status: "ACTIVE" } } };
    return args && undefined;
  });
  await assert.rejects(deleteComment(revoked.tx, "ev1", ZACK), /don't have access/);
});

test("deleteComment: a soft delete that takes its files along at the same instant, keeping their link", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const { tx, calls } = withComment();
  const out = await deleteComment(tx, "ev1", PIETER, now);
  assert.deepEqual(out, { taskId: "t1", deletedAt: now });
  assert.ok(!calls.some((c) => c.op === "delete" || c.op === "deleteMany"), "never a hard delete: an imported comment would come back with the next delta");
  assert.deepEqual(calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args, { where: { id: "ev1" }, data: { deletedAt: now } });
  // Only files still up; one a person removed earlier keeps its own stamp. They keep eventId.
  const files = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!;
  assert.deepEqual(files.args, { where: { eventId: "ev1", deletedAt: null }, data: { deletedAt: now } });
  assert.ok(!calls.some((c) => c.op.includes("NotificationOutbox")), "the drain drops it; no row is touched");
});

test("deleteComment: stamps who could have read it, keeping the data it had", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const { tx, calls } = withComment({ data: { clientId: "k1" } });
  await deleteComment(tx, "ev1", PIETER, now, ["c-zack"]);
  assert.deepEqual(calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args, {
    where: { id: "ev1" },
    data: { deletedAt: now, data: { clientId: "k1", seenBy: ["c-zack"] } },
  });
  // Nobody could have: the key says so, an empty list, and the portal shows no line.
  const none = withComment();
  await deleteComment(none.tx, "ev1", PIETER, now, []);
  assert.deepEqual((none.calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args as { data: unknown }).data, { deletedAt: now, data: { seenBy: [] } });
});

test("restoreComment: the comment and the files that went with it come back, and nothing else", async () => {
  const gone = new Date("2026-10-23T15:00:00Z");
  const { tx, calls } = withComment({ deletedAt: gone });
  await restoreComment(tx, "ev1", PIETER, new Date("2026-10-23T15:00:04Z"));
  const files = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!;
  assert.deepEqual(files.args, { where: { eventId: "ev1", deletedAt: gone }, data: { deletedAt: null } }, "only those the delete stamped, never an earlier removal");
  assert.deepEqual(calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args, { where: { id: "ev1" }, data: { deletedAt: null } });
  // It is not recomputed: no visibility, audience, actor, source or createdAt anywhere in the writes.
  const written = JSON.stringify(writes(calls).filter((c) => c.model !== "$executeRaw").map((c) => c.args));
  assert.doesNotMatch(written, /visibility|audienceContactId|actorUserId|source|createdAt/);
  // A comment that is back already is left as it is.
  const back = withComment();
  await restoreComment(back.tx, "ev1", PIETER);
  assert.deepEqual(writes(back.calls).map((c) => c.model), ["$executeRaw", "$executeRaw"], "only the two locks");
});

// ---------------------------------------------------------------------------
// Decisions: the note rides with its status (activity 2.2 d)
// ---------------------------------------------------------------------------

test("setStatus: Send back writes the status, then the note tied to it, and the email names the note inside the status line", async () => {
  const { tx, calls } = fakeTx({ status: "REVIEW", assigneeContactId: "c-zack", title: "Cabinet install" }, (model, op, args) => {
    if (model === "portalAccount" && op === "findUnique") return { status: "ACTIVE" };
    if (model === "taskEvent" && op === "create") return { id: (args.data as { kind: string }).kind === "STATUS" ? "s1" : "n1", ...args.data };
    return undefined;
  });
  const out = await setStatus(tx, "t1", "IN_PROGRESS", PIETER, { note: "  Level the uppers ", expected: "REVIEW" });
  assert.equal(out.statusEventId, "s1");
  assert.equal(out.noteEventId, "n1");
  const [status, note] = created(calls, "taskEvent").map((c) => (c.args as { data: Record<string, unknown> }).data);
  assert.equal(status.kind, "STATUS");
  assert.equal(note.kind, "COMMENT");
  assert.equal(note.body, "Level the uppers");
  assert.equal(note.visibility, "SHARED");
  assert.deepEqual(note.data, { statusEventId: "s1" }, "paired by id, never by adjacency");
  assert.equal(note.audienceContactId, "c-zack");
  // One email line: the status, with the note's id so an edit or a delete reaches it. No second comment line.
  const items = queued(calls);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { kind: "STATUS", actorLabel: "Pieter Louw", summary: 'sent "Cabinet install" back: Level the uppers', at: items[0].at, eventId: "s1", noteEventId: "n1" });
});

test("setStatus: a move with no note writes no comment and no note id", async () => {
  const { tx, calls } = fakeTx({ status: "REVIEW" });
  const out = await setStatus(tx, "t1", "IN_PROGRESS", PIETER, { expected: "REVIEW" });
  assert.equal(out.noteEventId, null);
  assert.equal(created(calls, "taskEvent").length, 1);
});

test("setStatus: a contractor's Mark done posts the note and photos as a comment tied to the status, even with photos only", async () => {
  const now = new Date("2026-10-23T15:00:00Z");
  const statusAt = new Date("2026-10-23T15:00:00.500Z");
  const { tx, calls } = fakeTx({ status: "IN_PROGRESS", assigneeContactId: "c-zack", title: "Fix steps" }, (model, op, args) => {
    if (model === "taskAccess" && op === "findUnique") return accessOk(model, op);
    if (model === "user" && op === "findMany") return [{ id: "u-connor" }];
    if (model === "taskAttachment" && op === "updateMany") return { count: 2 };
    if (model === "taskEvent" && op === "create") {
      const kind = (args.data as { kind: string }).kind;
      return { id: kind === "STATUS" ? "s1" : "n1", createdAt: statusAt, ...args.data };
    }
    return undefined;
  });
  const out = await setStatus(tx, "t1", "REVIEW", ZACK, { attachmentIds: ["a1", "a2"] }, now);
  assert.equal(out.noteEventId, "n1");
  const [, note] = created(calls, "taskEvent").map((c) => (c.args as { data: Record<string, unknown> }).data);
  assert.equal(note.body, null, "photos only");
  assert.deepEqual(note.data, { statusEventId: "s1" });
  assert.equal((note.createdAt as Date).getTime(), statusAt.getTime() - 1, "written a moment before the move to Review, as the finish set expects");
  assert.equal(note.audienceContactId, null);
  const link = calls.find((c) => c.model === "taskAttachment" && c.op === "updateMany")!;
  assert.deepEqual(link.args, { where: { id: { in: ["a1", "a2"] }, taskId: "t1", eventId: null }, data: { eventId: "n1", visibility: "SHARED", audienceContactId: null } });
  // Each partner is told the note, then that the job is done; the subject stays "Zack marked ... done".
  const items = queued(calls);
  assert.deepEqual(items.slice(0, 2).map((i) => [i.kind, i.summary, i.eventId]), [
    ["COMMENT", "added files (+2 files)", "n1"],
    ["STATUS", 'marked "Fix steps" done', "s1"],
  ]);
});

test("setStatus: a Mark done whose photos were taken by another post is refused as a whole", async () => {
  const { tx } = fakeTx({ status: "IN_PROGRESS", assigneeContactId: "c-zack" }, (model, op, args) => {
    if (model === "taskAccess") return accessOk(model, op);
    if (model === "taskAttachment" && op === "updateMany") return { count: 0 };
    if (model === "taskEvent" && op === "create") return { id: "s1", createdAt: new Date(), ...args.data };
    return undefined;
  });
  await assert.rejects(setStatus(tx, "t1", "REVIEW", ZACK, { attachmentIds: ["a1"] }), /Write something or add a photo/);
});

test("setStatus: a stale change credits whoever moved it there, not an approval that was taken back", async () => {
  const { tx, calls } = fakeTx({ status: "DONE" });
  await assert.rejects(setStatus(tx, "t1", "OPEN", PIETER, { expected: "REVIEW" }), TaskChangedError);
  const find = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((find.args as { where: unknown }).where, { taskId: "t1", kind: "STATUS", deletedAt: null, data: { path: ["to"], equals: "DONE" } });
});

// ---------------------------------------------------------------------------
// Approve's Undo
// ---------------------------------------------------------------------------

const UNDO_NOW = new Date("2026-10-23T15:00:00Z");
/** Pieter's approval, 30 seconds before UNDO_NOW. */
const APPROVAL = { id: "s9", data: { from: "REVIEW", to: "DONE" }, createdAt: new Date("2026-10-23T14:59:30Z"), actorUserId: "u-pieter", actorLabel: "Pieter Louw" };
type EmailRow = { sentAt: Date | null; lastError?: string | null; openKey: string | null; attempts: number };

/**
 * A Done task whose latest status line is `approval` (null for none), with the
 * reads undoApproval makes: `undone` answers the retry check (the approval
 * already soft-deleted by this approver), `emails` the approval's outbox rows.
 */
function approvalTx(
  row: Record<string, unknown> = {},
  opts: { approval?: Partial<typeof APPROVAL> | null; undone?: boolean; emails?: EmailRow[]; answer?: Answer } = {},
) {
  return fakeTx({ status: "DONE", ...row }, (model, op, args) => {
    const given = opts.answer?.(model, op, args);
    if (given !== undefined) return given;
    const where = args.where ?? {};
    if (model === "taskEvent" && op === "findFirst" && where.kind === "STATUS" && where.deletedAt && typeof where.deletedAt === "object") {
      return opts.undone ? { id: "s9" } : null;
    }
    if (model === "taskEvent" && op === "findFirst" && where.kind === "STATUS") return opts.approval === null ? null : { ...APPROVAL, ...opts.approval };
    if (model === "$queryRaw" && op.includes('FROM "NotificationOutbox"') && op.includes("@>")) return opts.emails ?? [];
    return undefined;
  });
}

const approvalEmailLock = (calls: Call[]) => calls.findIndex((c) => c.model === "$queryRaw" && c.op.includes('FROM "NotificationOutbox"') && c.op.includes("@>"));

test("undoApproval: back to Review as if never approved, writing no status line and no email", async () => {
  const { tx, calls } = approvalTx({ dealId: "d1", completedAt: UNDO_NOW }, { emails: [{ sentAt: null, openKey: "c:c-zack:t1", attempts: 0 }] });
  await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.match(calls[0].op, /FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE/);
  const update = calls.find((c) => c.model === "task" && c.op === "update")!;
  const data = (update.args as { data: Record<string, unknown> }).data;
  assert.equal(data.status, "REVIEW");
  assert.equal(data.completedAt, null);
  assert.equal(data.completedByUserId, null);
  // The Done line is soft-deleted, so the timeline hides it and the drain drops the queued approval.
  assert.deepEqual(calls.find((c) => c.model === "taskEvent" && c.op === "update")!.args, { where: { id: "s9" }, data: { deletedAt: UNDO_NOW } });
  // No status line, so Zack isn't told it moved to Review and his late-upload hour (the latest move to Review) is untouched.
  assert.ok(!created(calls, "taskEvent").some((c) => (c.args as { data: { kind: string } }).data.kind === "STATUS"));
  // The approval's email rows are only locked and read, never written: the drain drops the line itself.
  assert.ok(!calls.some((c) => c.model === "$executeRaw" && c.op.includes("NotificationOutbox")));
  // An approval whose deal line doesn't name it (written before lines did): the deal hears it was reopened.
  assert.equal(created(calls, "dealNote").length, 1);
});

test("undoApproval: the approval's email rows are locked after the task and before any write, in id order", async () => {
  const { tx, calls } = approvalTx();
  await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  const lock = approvalEmailLock(calls);
  assert.ok(lock > 0, "after the task lock");
  assert.ok(lock < calls.findIndex((c) => c.model === "task" && c.op === "update"), "before the task moves");
  assert.match(calls[lock].op, /"taskId" = \? AND "items" @> jsonb_build_array\(jsonb_build_object\('eventId', \?::text\)\)\s+ORDER BY "id" FOR UPDATE$/);
  assert.deepEqual(calls[lock].args, ["t1", "s9"]);
});

test("undoApproval: refused once the approval's email is sent or on its way, each with its own line, and nothing written", async () => {
  const sent: EmailRow = { sentAt: new Date("2026-10-23T14:59:50Z"), lastError: null, openKey: null, attempts: 1 };
  const claimed: EmailRow = { sentAt: null, lastError: null, openKey: null, attempts: 1 };
  // A try failed and the row waits to try again: it may still reach Zack.
  const backoff: EmailRow = { sentAt: null, lastError: "502 Bad Gateway", openKey: null, attempts: 2 };
  const open: EmailRow = { sentAt: null, lastError: null, openKey: "c:c-zack:t1", attempts: 0 };
  const cases: [EmailRow[], string][] = [
    [[sent], "Email already sent. Change the status."],
    [[claimed], "The email is on its way. Change the status."],
    [[backoff], "The email is on its way. Change the status."],
    [[open, claimed], "The email is on its way. Change the status."],
    // Sent says sent, whatever else is waiting.
    [[claimed, sent], "Email already sent. Change the status."],
  ];
  for (const [emails, line] of cases) {
    const { tx, calls } = approvalTx({}, { emails });
    await assert.rejects(undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW), (e: unknown) => e instanceof TaskRuleError && e.message === line);
    assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"], "only the task lock");
  }
  // Still open, or a try Resend refused and gave back (openKey null, attempts 0): the drain re-reads, so Undo goes through.
  for (const emails of [[open], [{ sentAt: null, lastError: "rate limited", openKey: null, attempts: 0 }]]) {
    const { tx, calls } = approvalTx({}, { emails });
    await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
    assert.ok(calls.some((c) => c.model === "task" && c.op === "update"));
  }
});

test("undoApproval: a row the drain closed without sending never reached Zack, so the Undo goes through", async () => {
  for (const lastError of ["nothing to send", "no login", "gave up: 500 Internal Server Error"]) {
    const closed: EmailRow = { sentAt: new Date("2026-10-23T14:59:50Z"), lastError, openKey: null, attempts: 1 };
    const { tx, calls } = approvalTx({}, { emails: [closed] });
    await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
    assert.ok(calls.some((c) => c.model === "task" && c.op === "update"), lastError);
  }
  // The lock reads lastError beside the rest, so it can tell the two apart.
  const { tx, calls } = approvalTx();
  await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.match(calls[approvalEmailLock(calls)].op, /SELECT "sentAt", "lastError", "openKey", "attempts" FROM "NotificationOutbox"/);
});

test("approvalEmailRefusal: sent, on its way, or nothing stopping the Undo", () => {
  const at = new Date("2026-10-23T14:59:50Z");
  assert.equal(approvalEmailRefusal([]), null);
  assert.equal(approvalEmailRefusal([{ sentAt: at, lastError: null, openKey: null, attempts: 1 }]), "Email already sent. Change the status.");
  assert.equal(approvalEmailRefusal([{ sentAt: at, lastError: "no login", openKey: null, attempts: 0 }]), null);
  assert.equal(approvalEmailRefusal([{ sentAt: null, lastError: null, openKey: null, attempts: 1 }]), "The email is on its way. Change the status.");
  assert.equal(approvalEmailRefusal([{ sentAt: null, lastError: "timeout", openKey: null, attempts: 3 }]), "The email is on its way. Change the status.");
  assert.equal(approvalEmailRefusal([{ sentAt: null, lastError: null, openKey: "u:u1:t1", attempts: 0 }]), null);
});

test("undoApproval: only the partner who approved, and only within 2 minutes", async () => {
  const connor = approvalTx({}, { approval: { actorUserId: "u-connor", actorLabel: "Connor Swofford" } });
  await assert.rejects(undoApproval(connor.tx, "t1", "s9", PIETER, UNDO_NOW), (e: unknown) => e instanceof TaskRuleError && e.message === "Connor approved this. Change the status.");
  assert.deepEqual(writes(connor.calls).map((c) => c.model), ["$executeRaw"]);
  assert.equal(approvalEmailLock(connor.calls), -1, "refused before any email row is locked");
  // An approval with no user behind it (an import, a system line) is nobody's to undo.
  const nobody = approvalTx({}, { approval: { actorUserId: null as unknown as string, actorLabel: "" } });
  await assert.rejects(undoApproval(nobody.tx, "t1", "s9", PIETER, UNDO_NOW), (e: unknown) => e instanceof TaskRuleError && e.message === "Not yours to undo. Change the status.");

  const late = approvalTx({}, { approval: { createdAt: new Date(UNDO_NOW.getTime() - 2 * 60_000 - 1) } });
  await assert.rejects(undoApproval(late.tx, "t1", "s9", PIETER, UNDO_NOW), (e: unknown) => e instanceof TaskRuleError && e.message === "Too late to undo. Change the status.");
  assert.deepEqual(writes(late.calls).map((c) => c.model), ["$executeRaw"]);
  const onTime = approvalTx({}, { approval: { createdAt: new Date(UNDO_NOW.getTime() - 2 * 60_000) } });
  await undoApproval(onTime.tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.ok(onTime.calls.some((c) => c.model === "task" && c.op === "update"), "exactly 2 minutes is still in time");
});

test("undoApproval: a retry of an Undo that went through is a quiet success that writes nothing", async () => {
  // The first try committed: the job is back in Review and the approval is soft-deleted.
  const { tx, calls } = approvalTx({ status: "REVIEW" }, { undone: true });
  const out = await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.equal(out.task.status, "REVIEW");
  assert.deepEqual(writes(calls).map((c) => c.model), ["$executeRaw"]);
  const check = calls.find((c) => c.model === "taskEvent" && c.op === "findFirst")!;
  assert.deepEqual((check.args as CallArgs).where, { id: "s9", taskId: "t1", kind: "STATUS", actorUserId: "u-pieter", deletedAt: { not: null } });
  // Without that, the retry reads as the job having moved: "Zack moved this to Review."
  await assert.rejects(undoApproval(approvalTx({ status: "REVIEW" }).tx, "t1", "s9", PIETER, UNDO_NOW), TaskChangedError);
});

test("undoApproval: the deal's Task completed line goes when it names the approval, with no Task reopened", async () => {
  const { tx, calls } = approvalTx({ dealId: "d1" }, { answer: (m, op) => (m === "dealNote" && op === "updateMany" ? { count: 1 } : undefined) });
  await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  const gone = calls.find((c) => c.model === "dealNote" && c.op === "updateMany")!;
  assert.deepEqual(gone.args, {
    where: { dealId: "d1", source: "change", deletedAt: null, data: { path: ["taskEventId"], equals: "s9" } },
    data: { deletedAt: UNDO_NOW },
  });
  assert.equal(created(calls, "dealNote").length, 0);
  // A task with no deal touches no deal lines.
  const solo = approvalTx();
  await undoApproval(solo.tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.ok(!solo.calls.some((c) => c.model === "dealNote"));
});

test("setStatus: Approve's deal line names the Done line, so its Undo can take it back; a reopen's doesn't", async () => {
  const { tx, calls } = fakeTx({ status: "REVIEW", dealId: "d1" }, (model, op, args) =>
    model === "taskEvent" && op === "create" ? { id: "s1", createdAt: UNDO_NOW, ...args.data } : undefined,
  );
  await setStatus(tx, "t1", "DONE", PIETER, { expected: "REVIEW" }, UNDO_NOW);
  const line = created(calls, "dealNote")[0].args as { data: { body: string; data?: unknown } };
  assert.equal(line.data.body, "Task completed: Hang drywall  ·  Pieter Louw");
  assert.deepEqual(line.data.data, { taskEventId: "s1" });
  const reopen = fakeTx({ status: "DONE", dealId: "d1" });
  await setStatus(reopen.tx, "t1", "OPEN", PIETER, { expected: "DONE" }, UNDO_NOW);
  assert.equal((created(reopen.calls, "dealNote")[0].args as { data: { data?: unknown } }).data.data, undefined);
});

test("undoApproval: refused when the job moved on, when the approval isn't the latest status line, or by a contractor", async () => {
  await assert.rejects(undoApproval(approvalTx({ status: "IN_PROGRESS" }).tx, "t1", "s9", PIETER, UNDO_NOW), (e: unknown) => e instanceof TaskChangedError && e.current === "IN_PROGRESS");
  await assert.rejects(undoApproval(approvalTx({}, { approval: { id: "s10" } }).tx, "t1", "s9", PIETER, UNDO_NOW), /changed after it was approved/);
  await assert.rejects(undoApproval(approvalTx({}, { approval: { data: { from: "OPEN", to: "DONE" } } }).tx, "t1", "s9", PIETER, UNDO_NOW), /changed after it was approved/);
  await assert.rejects(undoApproval(approvalTx().tx, "t1", "s9", ZACK, UNDO_NOW), /Only staff/);
  await assert.rejects(undoApproval(approvalTx({}, { approval: null }).tx, "t1", "s9", PIETER, UNDO_NOW), TaskRuleError);
});

test("undoApproval takes the next repeat copy back through the same rule as a reopen, locking the copy after the task's email rows", async () => {
  const copy = { status: "OPEN", appEditedAt: null, asanaId: null, events: [{ kind: "CREATED" }], _count: { attachments: 0, readStates: 0, checklist: 0 } };
  const { tx, calls } = approvalTx(
    { repeatRule: MONTHLY_5, repeatSeriesId: "s1" },
    {
      answer: (model, op, args) => {
        if (model === "taskEvent" && op === "findFirst" && args.where?.kind === "REPEAT_CREATED") return { id: "r1", data: { next: "t2", due: "2026-11-05" } };
        if (model === "task" && op === "findUnique" && args.where?.id === "t2") return args.select?.status ? copy : { id: "t2" };
        if (model === "$queryRaw" && op.includes('FROM "Task"')) return [{ id: "t2" }];
        return undefined;
      },
    },
  );
  await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  const deleted = calls.filter((c) => c.op === "delete").map((c) => `${c.model}:${(c.args as { where: { id: string } }).where.id}`);
  assert.deepEqual(deleted, ["task:t2", "taskEvent:r1"]);
  // Task A, A's email rows, copy B, B's email rows: the order every writer and the take-back keep.
  const order = calls
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.op.includes("FOR UPDATE") || c.op.includes("FOR NO KEY UPDATE"))
    .map(({ c }) => (c.op.includes('FROM "Task"') ? `task:${(c.args as unknown[])[0]}` : c.op.includes("@>") ? "emails:approval" : `emails:${(c.args as unknown[])[0]}`));
  assert.deepEqual(order, ["task:t1", "emails:approval", "task:t2", "emails:t2"]);
  // The copy's email rows in id order too, as every outbox lock takes them.
  const copyEmails = calls.find((c) => c.model === "$queryRaw" && c.op.includes('FROM "NotificationOutbox"') && !c.op.includes("@>"))!;
  assert.match(copyEmails.op, /WHERE "taskId" = \? ORDER BY "id" FOR UPDATE$/);
});

test("undoApproval: a touched copy stays, and the job still goes back to Review", async () => {
  const touched = { status: "OPEN", appEditedAt: null, asanaId: null, events: [{ kind: "CREATED" }, { kind: "COMMENT" }], _count: { attachments: 0, readStates: 0, checklist: 0 } };
  const { tx, calls } = approvalTx(
    { repeatRule: MONTHLY_5, repeatSeriesId: "s1" },
    {
      answer: (model, op, args) => {
        if (model === "taskEvent" && op === "findFirst" && args.where?.kind === "REPEAT_CREATED") return { id: "r1", data: { next: "t2", due: "2026-11-05" } };
        if (model === "task" && op === "findUnique" && args.where?.id === "t2") return args.select?.status ? touched : { id: "t2" };
        if (model === "$queryRaw" && op.includes('FROM "Task"')) return [{ id: "t2" }];
        return undefined;
      },
    },
  );
  const out = await undoApproval(tx, "t1", "s9", PIETER, UNDO_NOW);
  assert.equal(out.task.status, "REVIEW");
  assert.ok(!calls.some((c) => c.op === "delete"), "the copy and its REPEAT_CREATED line stay");
});

test("renameTaskUnits patches a property's tasks in id order, so two saves on one property lock them the same way round", async () => {
  const { tx, calls } = fakeTx({ propertyId: "p1", unitLabel: "1" }, (model, op) =>
    model === "task" && op === "findMany" ? [{ id: "t1", unitLabel: "1" }] : undefined,
  );
  assert.deepEqual(await renameTaskUnits(tx, "p1", [{ from: "1", to: "Upper" }], PIETER), ["t1"]);
  const find = calls.find((c) => c.model === "task" && c.op === "findMany")!;
  assert.deepEqual((find.args as { orderBy?: unknown }).orderBy, { id: "asc" });
});

test("takeBackRepeat: a partner opening the copy doesn't keep it; only the contractor's reads count", async () => {
  const { tx, calls } = fakeTx({ status: "DONE", repeatRule: MONTHLY_5, repeatSeriesId: "s1" }, (model, op, args) => {
    if (model === "taskEvent" && op === "findFirst") return { id: "e1", data: { next: "t2", due: "2026-11-05" } };
    if (model === "task" && op === "findUnique" && args.where?.id === "t2") {
      return args.select?.status ? { status: "OPEN", appEditedAt: null, asanaId: null, events: [{ kind: "CREATED" }], _count: { attachments: 0, readStates: 0, checklist: 0 } } : { id: "t2" };
    }
    if (model === "$queryRaw" && op.includes('FROM "Task"')) return [{ id: "t2" }];
    return undefined;
  });
  await setStatus(tx, "t1", "OPEN", PIETER, { expected: "DONE" }, new Date("2026-10-23T15:00:00Z"));
  const read = calls.find((c) => c.model === "task" && c.op === "findUnique" && (c.args as CallArgs).select?.status)!;
  const count = ((read.args as CallArgs).select as { _count: { select: { readStates: unknown } } })._count.select.readStates;
  assert.deepEqual(count, { where: { contactId: { not: null } } });
});

// ---------------------------------------------------------------------------
// Edits that leave a trail: notes, repeats and the date the contractor sees
// ---------------------------------------------------------------------------

const events = (calls: Call[]) =>
  created(calls, "taskEvent").map((c) => {
    const { kind, data, visibility } = (c.args as { data: { kind: string; data: unknown; visibility: string } }).data;
    return { kind, data, visibility };
  });

test("patchTask: notes keep the text from before the save, empty when there was none", async () => {
  const withText = fakeTx({ description: "Use the side door" });
  await patchTask(withText.tx, "t1", { description: "Use the back door" }, PIETER);
  assert.deepEqual(events(withText.calls).filter((e) => e.kind === "NOTES").map((e) => e.data), [{ from: "Use the side door" }]);
  const empty = fakeTx({ description: null });
  await patchTask(empty.tx, "t1", { description: "First notes" }, PIETER);
  assert.deepEqual(events(empty.calls).filter((e) => e.kind === "NOTES").map((e) => e.data), [{ from: "" }]);
});

test("patchTask: turning repeats on, changing and turning them off each write a REPEAT line; a save that changes nothing writes none", async () => {
  const weekly = { freq: "weeks", interval: 1 };
  const on = fakeTx({ repeatRule: null, dueDate: day("2026-10-30") });
  await patchTask(on.tx, "t1", { repeatRule: weekly as never }, PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.deepEqual(events(on.calls).filter((e) => e.kind === "REPEAT"), [{ kind: "REPEAT", data: { from: null, to: { freq: "weeks", interval: 1 } }, visibility: "INTERNAL" }]);

  const change = fakeTx({ repeatRule: weekly, dueDate: day("2026-10-30") });
  await patchTask(change.tx, "t1", { repeatRule: { freq: "weeks", interval: 2 } as never }, PIETER);
  assert.deepEqual(events(change.calls).filter((e) => e.kind === "REPEAT").map((e) => e.data), [{ from: { freq: "weeks", interval: 1 }, to: { freq: "weeks", interval: 2 } }]);

  const off = fakeTx({ repeatRule: weekly, dueDate: day("2026-10-30") });
  await patchTask(off.tx, "t1", { repeatRule: null }, PIETER);
  assert.deepEqual(events(off.calls).filter((e) => e.kind === "REPEAT").map((e) => e.data), [{ from: { freq: "weeks", interval: 1 }, to: null }]);

  // The editors send the rule on every save: unchanged writes the column, and no line.
  const same = fakeTx({ repeatRule: weekly, dueDate: day("2026-10-30") });
  await patchTask(same.tx, "t1", { repeatRule: { freq: "weeks", interval: 1 } as never }, PIETER);
  assert.equal(events(same.calls).filter((e) => e.kind === "REPEAT").length, 0);
  assert.ok(same.calls.some((c) => c.model === "task" && c.op === "update"));
  // Off to off is nothing either.
  const nothing = fakeTx({ repeatRule: null });
  await patchTask(nothing.tx, "t1", { repeatRule: null }, PIETER);
  assert.equal(events(nothing.calls).filter((e) => e.kind === "REPEAT").length, 0);
});

test("REPEAT is written only from patchTask, never as a task is made or its next copy", async () => {
  const made = fakeTx({}, makesCopy);
  await createTask(made.tx, { title: "Check taxes", repeatRule: MONTHLY_5 as never }, PIETER);
  await createNextRepeat(made.tx, finished({ dueDate: day("2026-07-05") }), PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.ok(!events(made.calls).some((e) => e.kind === "REPEAT"));
});

test("patchTask: the email for a moved date says whether it is the visit or the due date", async () => {
  const hasLogin: Answer = (model, op) => (model === "portalAccount" && op === "findUnique" ? { status: "ACTIVE" } : undefined);
  // Scheduled: the date the contractor sees is the booked visit.
  const visit = fakeTx({ status: "SCHEDULED", assigneeContactId: "c-zack", scheduledFor: day("2026-10-29"), dueDate: day("2026-11-10") }, hasLogin);
  await patchTask(visit.tx, "t1", { scheduledFor: "2026-10-30" }, PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.deepEqual(queued(visit.calls).map((i) => [i.kind, i.summary, i.visit]), [["TARGET", 'moved "Hang drywall" to Fri, Oct 30', true]]);
  // Otherwise it is the due date.
  const due = fakeTx({ status: "IN_PROGRESS", assigneeContactId: "c-zack", dueDate: day("2026-10-29") }, hasLogin);
  await patchTask(due.tx, "t1", { dueDate: "2026-10-30" }, PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.deepEqual(queued(due.calls).map((i) => [i.kind, i.visit]), [["TARGET", false]]);
  // Clearing the visit date is still about the visit.
  const cleared = fakeTx({ status: "SCHEDULED", assigneeContactId: "c-zack", scheduledFor: day("2026-10-29"), dueDate: null }, hasLogin);
  await patchTask(cleared.tx, "t1", { scheduledFor: null }, PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.deepEqual(queued(cleared.calls).map((i) => [i.summary, i.visit]), [['moved "Hang drywall" to no date', true]]);
});

// ---------------------------------------------------------------------------
// A tick that loses a race to a Remove
// ---------------------------------------------------------------------------

test("setChecklistItem: locks the task and then the item before it reads it, so a tick that loses to a Remove gets the rule error, not a missing-row failure", async () => {
  // The first read only names the task. The Remove committed while the tick waited: after the locks the item is gone.
  const { tx, calls } = fakeTx({}, (model, op, args) =>
    model === "taskChecklistItem" && op === "findUnique" ? (args.select?.taskId ? { taskId: "t1" } : null) : undefined,
  );
  await assert.rejects(setChecklistItem(tx, "i1", true, PIETER), (err: unknown) => err instanceof TaskRuleError && err.message === "That checklist item no longer exists.");
  assert.deepEqual(
    calls.slice(0, 4).map((c) => `${c.model}${c.model === "$executeRaw" ? ` ${(c.args as unknown[])[0]}` : `.${c.op}`}`),
    ["taskChecklistItem.findUnique", "$executeRaw t1", "$executeRaw i1", "taskChecklistItem.findUnique"],
  );
  assert.match(calls[1].op, /^SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.match(calls[2].op, /^SELECT 1 FROM "TaskChecklistItem" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.ok(!calls.some((c) => c.op === "update"), "nothing written");
});

test("setChecklistItem: an item already gone locks nothing and says so", async () => {
  const { tx, calls } = fakeTx({}, (model, op) => (model === "taskChecklistItem" && op === "findUnique" ? null : undefined));
  await assert.rejects(setChecklistItem(tx, "i1", true, PIETER), /no longer exists/);
  assert.ok(!calls.some((c) => c.model === "$executeRaw"));
});

test("addChecklistItem: the task row is locked first, and a task deleted meanwhile is refused before the insert", async () => {
  const { tx, calls } = fakeTx({});
  await addChecklistItem(tx, "t1", "Patch the wall", PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.equal(calls[0].model, "$executeRaw");
  assert.match(calls[0].op, /^SELECT 1 FROM "Task" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.deepEqual(calls[0].args, ["t1"]);
  assert.ok(calls.findIndex((c) => c.model === "taskChecklistItem" && c.op === "create") > 0);

  const gone = fakeTx({}, (model, op) => (model === "task" && op === "findUnique" ? null : undefined));
  await assert.rejects(addChecklistItem(gone.tx, "t1", "Patch the wall", PIETER), /no longer exists/);
  assert.ok(!gone.calls.some((c) => c.model === "taskChecklistItem" && c.op === "create"));
});

test("setChecklistItem: a tick on an item that is there still writes the tick and its line", async () => {
  const item = { id: "i1", taskId: "t1", title: "Demo", done: false, task: { id: "t1", status: "OPEN" } };
  const { tx, calls } = fakeTx({}, (model, op) => (model === "taskChecklistItem" && op === "findUnique" ? item : undefined));
  await setChecklistItem(tx, "i1", true, PIETER, new Date("2026-10-23T15:00:00Z"));
  assert.deepEqual(events(calls).map((e) => e.kind), ["CHECKLIST"]);
  assert.ok(calls.some((c) => c.model === "taskChecklistItem" && c.op === "update"));
});
