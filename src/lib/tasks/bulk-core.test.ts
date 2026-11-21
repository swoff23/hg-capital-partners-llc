import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskStatus } from "@prisma/client";
import {
  assignEach,
  deleteEach,
  lockTasks,
  moveDatesEach,
  setPropertyEach,
  setStatusEach,
  undoAssignEach,
  undoDatesEach,
  undoPropertyEach,
  undoStatusEach,
  type LockedTask,
} from "./bulk-core";
import { DRAFT_DELETE_LINE, TaskRuleError, type Principal, type Tx } from "./core";

/**
 * Bulk edit never touches a draft from Claude (docs/specs/tasks-from-claude.md
 * 6.2), whatever ids the request carries: the list offers none to pick, so
 * these hold the server to it. On a fake transaction that keeps every call in
 * order, as core.test.ts and drafts-core.test.ts do; bulk.pg.test.ts runs the
 * same on Postgres.
 */

const PIETER: Principal = { kind: "staff", userId: "u-pieter", label: "Pieter Louw" };
const NOW = new Date("2026-11-20T19:00:00Z");

interface Call {
  model: string;
  op: string;
  args: unknown;
}
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown> };

const row = (id: string, status: TaskStatus, over: Partial<LockedTask> = {}): LockedTask => ({
  id,
  status,
  discardedAt: null,
  waitingOn: null,
  scheduledFor: null,
  dueDate: null,
  propertyId: null,
  unitLabel: null,
  dealId: null,
  assigneeUserId: null,
  assigneeContactId: null,
  assigneeName: null,
  ...over,
});

/** The draft every test sends: Zack's, due Nov 25, at a building, as a partner's Claude saved it. */
const DRAFT = row("t-draft", "DRAFT", { assigneeContactId: "c-zack", dueDate: new Date("2026-11-25T00:00:00Z"), propertyId: "p-crescent", unitLabel: "Rear" });

/** The ids a raw statement was given: Prisma.join's list, or a bare id. */
function idsOf(values: unknown[]): string[] {
  return values.flatMap((v) => {
    if (typeof v === "string") return [v];
    if (v && typeof v === "object" && "values" in v) return (v as { values: unknown[] }).values.filter((x): x is string => typeof x === "string");
    return [];
  });
}

/** A transaction over these tasks: the lock read answers with the rows asked for, in id order, and every call is kept. */
function fakeTx(tasks: LockedTask[]) {
  const calls: Call[] = [];
  const stored = new Map(tasks.map((t) => [t.id, { title: `Task ${t.id}`, description: null, repeatRule: null, entryPermittedAt: null, assigneeEmail: null, ...t }]));
  const raw = (model: "$executeRaw" | "$queryRaw") => async (sql: TemplateStringsArray, ...values: unknown[]) => {
    const op = sql.join("?").replace(/\s+/g, " ").trim();
    calls.push({ model, op, args: idsOf(values) });
    if (model === "$executeRaw") return 1;
    if (op.includes('FROM "Task"') && op.includes("FOR NO KEY UPDATE")) {
      return idsOf(values)
        .sort()
        .flatMap((id) => (stored.has(id) ? [{ ...stored.get(id)! }] : []));
    }
    return [];
  };
  const result = (model: string, op: string, args: Args) => {
    const id = args.where?.id as string | undefined;
    if (model === "task" && op === "findUnique") return id ? (stored.get(id) ?? null) : null;
    if (model === "task" && op === "update") {
      const next = { ...stored.get(id!)!, ...args.data } as typeof stored extends Map<string, infer V> ? V : never;
      stored.set(id!, next);
      return next;
    }
    if (model === "taskEvent" && op === "create") return { id: `ev-${calls.length}`, createdAt: NOW, ...args.data };
    if (model === "property" && op === "findUnique") return { units: [{ label: "Rear" }] };
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany" || op === "deleteMany") return { count: 0 };
    return { id: `${model}-${calls.length}` };
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
  return { tx, calls, stored };
}

/**
 * The batch's lock step, the two reads lockTasks makes of every pick before anything is known about it: which repeat
 * copies to hold (a status change only, read from the picks' REPEAT_CREATED lines), then the one locking read.
 */
const isLockStep = (c: Call) =>
  c.model === "$queryRaw" && ((c.op.includes('FROM "Task"') && c.op.includes("FOR NO KEY UPDATE")) || (c.op.includes('FROM "TaskEvent"') && c.op.includes("'REPEAT_CREATED'")));
/** Every call that names this task, the batch's lock step aside. */
const touching = (calls: Call[], id: string) => calls.filter((c) => !isLockStep(c) && JSON.stringify(c.args).includes(`"${id}"`));
const savepoints = (calls: Call[]) => calls.filter((c) => c.model === "$executeRaw" && c.op.startsWith("SAVEPOINT")).length;

test("lockTasks hands on tasks only: a draft is locked with the rest, counted, and never returned", async () => {
  const { tx, calls } = fakeTx([row("t-open", "OPEN"), DRAFT, row("t-done", "DONE")]);
  const out = await lockTasks(tx, ["t-open", "t-draft", "t-done", "t-gone"]);
  assert.deepEqual(out.tasks.map((t) => [t.id, t.status]), [["t-done", "DONE"], ["t-open", "OPEN"]], "in id order, without the draft");
  assert.equal(out.drafts, 1);
  // One statement takes every pick, the draft included, so the status it read is the one the draft keeps until the
  // batch commits: an Add waits its turn, and what was skipped as a draft is not a task a moment later inside it.
  assert.equal(calls.length, 1);
  assert.match(calls[0].op, /FROM "Task" WHERE "id" IN \(\?\) ORDER BY "id" FOR NO KEY UPDATE$/);
  assert.deepEqual(calls[0].args, ["t-open", "t-draft", "t-done", "t-gone"]);
  assert.deepEqual(await lockTasks(tx, []), { tasks: [], drafts: 0 }, "no picks read nothing");
});

test("every bulk change and every bulk Undo skips a draft as changed since, before a savepoint or any read or write of it", async () => {
  const id = DRAFT.id;
  // Each as the list could never send it: the draft's own id, with what its row holds, so nothing but the draft
  // check stands between the request and a write. The Undos name the draft's own values as the change to take back.
  const runs: Record<string, (tx: Tx) => Promise<{ done: number; changed: unknown[]; skipped: object; rows: LockedTask[] }>> = {
    setStatusEach: (tx) => setStatusEach(tx, [{ id, expected: "DRAFT" }], "DONE", {}, PIETER),
    "setStatusEach to Waiting": (tx) => setStatusEach(tx, [{ id, expected: "DRAFT" }], "WAITING", { waitingOn: "the city" }, PIETER),
    "setStatusEach to Draft": (tx) => setStatusEach(tx, [{ id, expected: "DRAFT" }], "DRAFT", {}, PIETER),
    undoStatusEach: (tx) =>
      undoStatusEach(tx, [{ id, from: "DRAFT", to: "DRAFT", waitingOn: null, scheduledFor: "2026-12-01", setWaitingOn: null, setScheduledFor: null, approvedEventId: null }], PIETER),
    "undoStatusEach of an approval": (tx) =>
      undoStatusEach(tx, [{ id, from: "REVIEW", to: "DRAFT", waitingOn: null, scheduledFor: null, setWaitingOn: null, setScheduledFor: null, approvedEventId: "ev-1" }], PIETER),
    assignEach: (tx) => assignEach(tx, [{ id, expected: { contactId: "c-zack" } }], { contactId: "c-jose" }, PIETER),
    "assignEach to nobody": (tx) => assignEach(tx, [{ id, expected: { contactId: "c-zack" } }], null, PIETER),
    undoAssignEach: (tx) => undoAssignEach(tx, [{ id, from: null, to: { contactId: "c-zack" }, fromName: "Mike (Asana)" }], PIETER),
    setPropertyEach: (tx) => setPropertyEach(tx, [id], "p-congress", PIETER),
    "setPropertyEach to none": (tx) => setPropertyEach(tx, [id], null, PIETER),
    undoPropertyEach: (tx) => undoPropertyEach(tx, [{ id, from: { propertyId: null, unitLabel: null }, to: { propertyId: "p-crescent", unitLabel: "Rear" } }], PIETER),
    moveDatesEach: (tx) => moveDatesEach(tx, [id], "2026-12-10", PIETER),
    "moveDatesEach clearing": (tx) => moveDatesEach(tx, [id], null, PIETER),
    undoDatesEach: (tx) => undoDatesEach(tx, [{ id, field: "dueDate", value: null, set: "2026-11-25" }], PIETER),
  };
  for (const [name, run] of Object.entries(runs)) {
    const { tx, calls, stored } = fakeTx([DRAFT]);
    const before = JSON.stringify(stored.get(id));
    const out = await run(tx);
    assert.deepEqual([out.done, out.changed, out.skipped], [0, [], { changed: 1 }], `${name}: skipped, and counted as changed since`);
    assert.deepEqual(out.rows, [], `${name}: no row to refresh`);
    assert.deepEqual(touching(calls, id), [], `${name}: nothing past the lock step names the draft`);
    assert.equal(calls.filter((c) => c.model === "$executeRaw").length, 0, `${name}: no savepoint, no second lock`);
    assert.deepEqual(
      calls.filter((c) => !isLockStep(c)).map((c) => `${c.model}.${c.op}`),
      name.startsWith("setPropertyEach") && !name.endsWith("none") ? ["property.findUnique"] : [],
      `${name}: after the lock step, only the building asked for is read`,
    );
    assert.deepEqual(
      calls.filter((c) => /^(create|update|upsert|delete)/.test(c.op)),
      [],
      `${name}: no write of any kind`,
    );
    assert.equal(JSON.stringify(stored.get(id)), before, `${name}: the draft is as it was`);
  }
});

test("a draft sent with real tasks: the tasks change, each in its savepoint, and the draft is in no statement past the lock step", async () => {
  const setup = () => fakeTx([row("t-a", "OPEN", { dueDate: new Date("2026-11-24T00:00:00Z") }), DRAFT, row("t-z", "OPEN")]);
  const ids = ["t-a", DRAFT.id, "t-z"];

  const status = setup();
  const moved = await setStatusEach(status.tx, ids.map((id) => ({ id, expected: id === DRAFT.id ? ("DRAFT" as const) : ("OPEN" as const) })), "IN_PROGRESS", {}, PIETER);
  assert.deepEqual([moved.done, moved.skipped], [2, { changed: 1 }]);
  assert.deepEqual(moved.changed.map((c) => c.id), ["t-a", "t-z"], "only the tasks can be undone");
  assert.deepEqual([status.stored.get("t-a")?.status, status.stored.get("t-z")?.status, status.stored.get(DRAFT.id)?.status], ["IN_PROGRESS", "IN_PROGRESS", "DRAFT"]);
  assert.equal(savepoints(status.calls), 2);
  assert.deepEqual(touching(status.calls, DRAFT.id), []);

  const assign = setup();
  const given = await assignEach(assign.tx, ids.map((id) => ({ id, expected: id === DRAFT.id ? { contactId: "c-zack" } : null })), { userId: "u-pieter" }, PIETER);
  assert.deepEqual([given.done, given.skipped, given.emails], [2, { changed: 1 }, 0]);
  assert.deepEqual([assign.stored.get("t-a")?.assigneeUserId, assign.stored.get(DRAFT.id)?.assigneeUserId, assign.stored.get(DRAFT.id)?.assigneeContactId], ["u-pieter", null, "c-zack"]);
  assert.deepEqual(touching(assign.calls, DRAFT.id), []);

  const dates = setup();
  const dated = await moveDatesEach(dates.tx, ids, "2026-12-01", PIETER);
  assert.deepEqual([dated.done, dated.skipped], [2, { changed: 1 }]);
  assert.deepEqual(dated.changed.map((c) => [c.id, c.field, c.value, c.set]), [["t-a", "dueDate", "2026-11-24", "2026-12-01"], ["t-z", "dueDate", null, "2026-12-01"]]);
  assert.equal(dates.stored.get(DRAFT.id)?.dueDate?.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.deepEqual(touching(dates.calls, DRAFT.id), []);
});

test("a pick that is a draft and a pick that is gone are counted apart", async () => {
  const { tx } = fakeTx([DRAFT, row("t-a", "OPEN")]);
  const out = await setPropertyEach(tx, ["t-gone", DRAFT.id, "t-a", "t-gone"], "p-congress", PIETER);
  assert.deepEqual([out.done, out.skipped], [1, { changed: 1, gone: 1 }]);
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** The app's client as deleteEach reads it, over these statuses, and a delete that records what it was handed. */
function fakeDelete(statuses: Record<string, TaskStatus>, opts: { failsOn?: string; unreadable?: string; discarded?: string; refusedAsDraft?: string } = {}) {
  const log: string[] = [];
  const db = {
    task: {
      findUnique: (async (args: { where: { id: string } }) => {
        log.push(`read ${args.where.id}`);
        if (args.where.id === opts.unreadable) throw new Error("connection lost");
        const status = statuses[args.where.id];
        return status ? { status, discardedAt: args.where.id === opts.discarded ? NOW : null } : null;
      }) as unknown as Tx["task"]["findUnique"],
    },
  };
  const remove = async (id: string) => {
    log.push(`delete ${id}`);
    if (id === opts.failsOn) throw new Error("blob store down");
    // What the delete itself answers for a draft, under the row's lock (core.ts deleteTask).
    if (id === opts.refusedAsDraft) throw new TaskRuleError(DRAFT_DELETE_LINE);
  };
  return { db, remove, log };
}

test("bulk delete never hands a draft to the delete: it is left, and counted as neither deleted nor failed", async () => {
  const { db, remove, log } = fakeDelete({ "t-a": "OPEN", "t-draft": "DRAFT", "t-done": "DONE", "t-canceled": "CANCELED" });
  const out = await deleteEach(db, ["t-a", "t-draft", "t-done", "t-gone", "t-a", "t-canceled"], remove);
  assert.deepEqual(out, { deleted: 4, failed: 0, drafts: 1 });
  // Each status is read just before that pick's delete, never all at the start; one already gone still goes to the
  // delete, which finds nothing and counts as what was asked.
  assert.deepEqual(log, ["read t-a", "delete t-a", "read t-draft", "read t-done", "delete t-done", "read t-gone", "delete t-gone", "read t-canceled", "delete t-canceled"]);
  assert.ok(!log.includes("delete t-draft"));

  const only = fakeDelete({ "t-draft": "DRAFT" });
  assert.deepEqual(await deleteEach(only.db, ["t-draft"], only.remove), { deleted: 0, failed: 0, drafts: 1 });
  assert.deepEqual(only.log, ["read t-draft"]);
});

test("a task that becomes a draft again as it is deleted is the delete's to refuse, and is counted as a draft, not a failure", async () => {
  // The read here still says To do (an Add's Undo landed after it); the delete locks the row and refuses.
  const { db, remove, log } = fakeDelete({ "t-a": "OPEN", "t-undone": "OPEN" }, { refusedAsDraft: "t-undone" });
  const failures: string[] = [];
  assert.deepEqual(await deleteEach(db, ["t-undone", "t-a"], remove, (_, id) => failures.push(id)), { deleted: 1, failed: 0, drafts: 1 });
  assert.deepEqual(log, ["read t-undone", "delete t-undone", "read t-a", "delete t-a"]);
  assert.deepEqual(failures, []);
});

test("a draft a partner discarded is gone to bulk edit as a deleted task is: never locked in as a pick, and a delete counts it as done", async () => {
  const discarded = row("t-discarded", "DRAFT", { discardedAt: NOW });
  const { tx } = fakeTx([discarded, DRAFT, row("t-a", "OPEN")]);
  const picked = await lockTasks(tx, ["t-a", "t-discarded", "t-draft"]);
  assert.deepEqual([picked.tasks.map((t) => t.id), picked.drafts], [["t-a"], 1], "neither handed on nor counted as a draft");
  const out = await setPropertyEach(fakeTx([discarded, row("t-a", "OPEN")]).tx, ["t-discarded", "t-a"], "p-congress", PIETER);
  assert.deepEqual([out.done, out.skipped], [1, { gone: 1 }]);
  // Delete: it goes to the delete, which finds it gone and removes nothing (core.ts deleteTask), as for a missing row.
  const { db, remove, log } = fakeDelete({ "t-discarded": "DRAFT" }, { discarded: "t-discarded" });
  assert.deepEqual(await deleteEach(db, ["t-discarded"], remove), { deleted: 1, failed: 0, drafts: 0 });
  assert.deepEqual(log, ["read t-discarded", "delete t-discarded"]);
});

test("bulk delete counts one that fails and goes on, and deletes nothing whose status it couldn't read", async () => {
  const { db, remove, log } = fakeDelete({ "t-a": "OPEN", "t-b": "OPEN", "t-c": "OPEN" }, { failsOn: "t-a", unreadable: "t-b" });
  const failures: [string, string][] = [];
  const out = await deleteEach(db, ["t-a", "t-b", "t-c"], remove, (err, id) => failures.push([id, (err as Error).message]));
  assert.deepEqual(out, { deleted: 1, failed: 2, drafts: 0 });
  assert.deepEqual(failures, [["t-a", "blob store down"], ["t-b", "connection lost"]]);
  // t-b might be a draft for all it could tell, so it never reached the delete.
  assert.deepEqual(log, ["read t-a", "delete t-a", "read t-b", "read t-c", "delete t-c"]);
});

// ---------------------------------------------------------------------------
// The one place: every bulk write takes its rows from lockTasks
// ---------------------------------------------------------------------------

const source = readFileSync(join(import.meta.dirname, "bulk-core.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const fnBody = (name: string) => {
  const start = source.search(new RegExp(`(export )?async function ${name}\\b`));
  assert.ok(start >= 0, `${name} is in bulk-core.ts`);
  const next = source.slice(start + 1).search(/\n(export )?(async )?function /);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("every change and Undo in bulk-core.ts runs through eachTask, which runs only the rows lockTasks handed on", () => {
  const edits = ["setStatusEach", "undoStatusEach", "assignEach", "undoAssignEach", "setPropertyEach", "undoPropertyEach", "moveDatesEach", "undoDatesEach"];
  for (const name of edits) {
    assert.equal(fnBody(name).match(/\beachTask</g)?.length, 1, `${name} takes its rows from eachTask`);
    assert.doesNotMatch(fnBody(name), /\blockTasks\(|\$queryRaw|FROM "Task"/, `${name} reads no task rows of its own`);
  }
  // A new export that writes tasks belongs in that list, behind eachTask (or, for a delete, deleteEach).
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, [...edits, "deleteEach", "lockTasks"].sort());

  const each = fnBody("eachTask");
  assert.match(each, /const \{ tasks: rows, drafts \} = await lockTasks\(tx, unique, lock\);/);
  assert.match(each, /if \(drafts\) addSkip\(out\.skipped, "changed", drafts\);/);
  assert.match(each, /for \(const row of rows\) \{\s*await tx\.\$executeRaw`SAVEPOINT bulk_task`;\s*try \{\s*const result = await each\(row\);/);
  assert.equal(source.match(/\beach\(/g)?.length, 1, "the edit's own step runs in one place");
  assert.equal(source.match(/\blockTasks\(/g)?.length, 2, "its definition, and eachTask's one call");
  assert.match(fnBody("lockTasks"), /const tasks = read\.filter\(\(r\) => !isDraftStatus\(r\.status\)\);\s*return \{ tasks, drafts: read\.length - tasks\.length \};/);
});
