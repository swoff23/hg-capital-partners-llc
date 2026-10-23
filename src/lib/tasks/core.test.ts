import test from "node:test";
import assert from "node:assert/strict";
import { AssigneeChangedError, isAssignee, patchTask, statusSummary, TaskChangedError, TaskRuleError, type Principal, type Tx } from "./core";

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

function fakeTx(row: Record<string, unknown>) {
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
  const result = (model: string, op: string, args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => {
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
