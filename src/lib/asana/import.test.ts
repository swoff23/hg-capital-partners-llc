import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Tx } from "@/lib/tasks/core";
import { notifyAudience, type NotifyChange } from "@/lib/tasks/rules";
import { ASANA_PRINCIPAL, deleteCsvRows, linkLegacyAssignee, StalePlanError, writeAttachment, writeIdentity, writeTask, writeTemplate } from "./import";
import { buildPlan, type DbContact, type DbUser, type TaskPlan } from "./map";
import { buildFixture, DEFAULT_WORLD } from "./__fixtures__/snapshot";

/**
 * The importer must never email anyone (docs/asana-migration-plan.md §5.4:
 * "The importer never enqueues"). These run every writer in ./import.ts
 * against a fake transaction that throws the moment anything touches
 * NotificationOutbox or raw SQL (the outbox insert is the only raw write in
 * core.ts), including the repeat path, where core notifies as the "asana"
 * principal on a contractor's job with an active portal login.
 */

interface Call {
  model: string;
  op: string;
  args: unknown;
}

function fakeTx(opts: { appEditedAt?: Date | null; task?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const forbidden = (what: string) => {
    throw new Error(`importer touched ${what}`);
  };
  const result = (model: string, op: string, args: { where?: Record<string, unknown>; data?: unknown; create?: unknown }) => {
    switch (op) {
      case "findUnique":
      case "findFirst":
        if (model === "task") {
          return {
            id: args.where?.id ?? "t1",
            title: "Furnace service",
            description: null,
            status: "DONE",
            dueDate: new Date("2026-10-30T00:00:00Z"),
            propertyId: "p1",
            unitLabel: null,
            assigneeUserId: null,
            assigneeContactId: "c1",
            assigneeName: null,
            bucket: "Property",
            repeatRule: { freq: "monthly", interval: 1 },
            repeatSeriesId: null,
            createdByUserId: null,
            dealId: null,
            appEditedAt: opts.appEditedAt ?? null,
            ...opts.task,
          };
        }
        // Worst case for email: the contractor has an active portal login.
        if (model === "portalAccount") return { status: "ACTIVE" };
        if (model === "user" || model === "contact") return { asanaGid: null };
        return null;
      case "findMany":
        return [];
      case "create":
      case "upsert":
        return { id: `${model}-${calls.length}`, ...((args.data ?? args.create) as object) };
      case "update":
        return { id: `${model}-${calls.length}`, ...(args.data as object) };
      case "updateMany":
        // The legacy link's compare-and-set: it matches only while the row still has nobody but that name.
        if (model === "task" && args.where && "assigneeName" in args.where) {
          const row: Record<string, unknown> = { assigneeUserId: null, assigneeContactId: null, assigneeName: null, ...opts.task };
          const where = args.where;
          return { count: ["assigneeUserId", "assigneeContactId", "assigneeName"].every((k) => where[k] === row[k]) ? 1 : 0 };
        }
        // The writer's compare-and-set: it matches only while appEditedAt is what the plan saw.
        if (model === "task") {
          const want = args.where?.appEditedAt as Date | null | undefined;
          const have = opts.appEditedAt ?? null;
          return { count: (want?.getTime() ?? null) === (have?.getTime() ?? null) ? 1 : 0 };
        }
        return { count: 0 };
      case "createMany":
      case "deleteMany":
        return { count: 0 };
      default:
        return null;
    }
  };
  const tx = new Proxy(
    {},
    {
      get(_, model: string) {
        if (model === "then") return undefined;
        if (model.startsWith("$")) return () => forbidden(model);
        if (/outbox/i.test(model)) return forbidden(model);
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

const USERS: DbUser[] = [{ id: "u-connor", email: "connoraswofford@gmail.com", name: "Connor Swofford", asanaGid: null }];
const CONTACTS: DbContact[] = [
  { id: "c-zed", fullName: "Zed Carpenter", email: "zed@carpentry.example", asanaGid: null, active: true },
  { id: "c-ivy", fullName: "Ivy Electric", email: "ivy@electric.example", asanaGid: null, active: true },
];
const snap = buildFixture();
const plan = buildPlan(
  {
    mode: "load",
    projectGid: DEFAULT_WORLD.projectGid,
    asOf: DEFAULT_WORLD.startedAt,
    tasks: snap.tasks,
    stories: snap.stories,
    attachments: snap.attachments,
    users: snap.users,
    files: new Map(snap.files.map((f) => [f.attachmentGid, { path: `/x/${f.name}`, bytes: 10 }])),
  },
  {
    users: USERS,
    contacts: CONTACTS,
    properties: [{ id: "p-118", address: "118 Congress St" }],
    tasks: [],
    checklist: [],
    templates: [],
    storyGids: new Set(),
    attachmentGids: new Set(),
  },
  { newId: (() => {
    let n = 0;
    return () => `new-${++n}`;
  })() },
);

test("the fake transaction fails on any outbox or raw SQL access (so the tests below mean something)", async () => {
  const { tx } = fakeTx();
  const raw = tx as unknown as Record<string, unknown>;
  assert.throws(() => raw.notificationOutbox, /outbox/i);
  assert.throws(() => (raw.$executeRaw as () => void)(), /\$executeRaw/);
});

test("the importer's principal is one rules.ts never emails for, whatever changed", () => {
  assert.equal(ASANA_PRINCIPAL.kind, "asana");
  const kinds: NotifyChange["kind"][] = ["COMMENT", "ATTACHMENT", "STATUS", "ASSIGNED", "TARGET", "NOTES", "DUE", "CHECKLIST", "CONFLICT", "CREATED"];
  for (const kind of kinds) {
    for (const visibility of ["SHARED", "INTERNAL"] as const) {
      assert.equal(notifyAudience("asana", { kind, visibility }, { contractorHasLogin: true }), null, `${kind} ${visibility}`);
    }
  }
});

test("writing every task in a load plan never touches the outbox", async () => {
  assert.ok(plan.tasks.length > 10);
  for (const tp of plan.tasks) {
    const { tx, calls } = fakeTx();
    const r = await writeTask(tx, tp);
    assert.equal(r.created, true);
    assert.ok(calls.some((c) => c.model === "task" && c.op === "create"));
    assert.ok(calls.some((c) => c.model === "taskAccess"), "access follows the assignee");
  }
  for (const a of plan.tasks.flatMap((t) => t.attachments)) {
    if (a.source.type === "missing") continue;
    const { tx } = fakeTx();
    const stored = a.source.type === "file" ? { url: "u", pathname: `tasks/${a.taskId}/orig/x`, size: 10, thumbPathname: null, posterPathname: null, width: null, height: null, durationSec: null } : null;
    assert.equal(await writeAttachment(tx, a, stored), "created");
  }
  for (const t of plan.templates) assert.equal(await writeTemplate(fakeTx().tx, t), "created");
  await writeIdentity(fakeTx().tx, plan.people);
  await deleteCsvRows(fakeTx().tx, ["r1", "r2"]);
});

test("closing a repeating contractor job from Asana creates the next copy without email", async () => {
  const tp: TaskPlan = { ...plan.tasks.find((t) => t.contactId)!, op: "update", status: "close", repeatOnClose: true, rowAppEditedAt: null };
  const { tx, calls } = fakeTx();
  const r = await writeTask(tx, tp);
  assert.ok(r.nextRepeatId, "next copy created");
  assert.ok(calls.some((c) => c.model === "portalAccount"), "core checked the contractor's login and still sent nothing");
});

test("linking a name-only assignee: one compare-and-set, an ASSIGNED line keeping the name, the contractor's access, no email", async () => {
  const { tx, calls } = fakeTx({ task: { assigneeName: "José Alvarez" } });
  const now = new Date("2026-10-27T14:00:00Z");
  assert.equal(await linkLegacyAssignee(tx, { taskId: "t9", name: "José Alvarez", assignee: { contactId: "c-jose" } }, now), true);
  const set = calls.find((c) => c.model === "task" && c.op === "updateMany")!;
  assert.deepEqual(set.args, {
    where: { id: "t9", assigneeUserId: null, assigneeContactId: null, assigneeName: "José Alvarez", status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] } },
    // appEditedAt: a load or delta plan made before the link is then stale (StalePlanError) instead of revoking the access.
    data: { assigneeUserId: null, assigneeContactId: "c-jose", assigneeName: null, assigneeEmail: null, appEditedAt: now },
  });
  const ev = calls.find((c) => c.model === "taskEvent" && c.op === "create")!.args as { data: { kind: string; source: string; data: { from: { name: string } } } };
  assert.deepEqual([ev.data.kind, ev.data.source, ev.data.data.from.name], ["ASSIGNED", "ASANA", "José Alvarez"]);
  assert.ok(calls.some((c) => c.model === "taskAccess" && c.op === "upsert"), "D12: the job reaches him");
  assert.ok(!calls.some((c) => c.model === "task" && c.op === "update"), "never a read and then a separate write");
});

test("a name-only task picked in the app since the plan isn't linked over the pick", async () => {
  // Pieter picked Connor in the app after the plan: the row no longer has only the name.
  const { tx, calls } = fakeTx({ task: { assigneeUserId: "u-connor", assigneeContactId: null, assigneeName: null } });
  assert.equal(await linkLegacyAssignee(tx, { taskId: "t9", name: "José Alvarez", assignee: { userId: "u-connor" } }), false);
  assert.deepEqual(
    calls.filter((c) => c.op !== "updateMany").map((c) => `${c.model}.${c.op}`),
    [],
    "no timeline line, no access change",
  );
});

test("a task the app edited after planning is skipped, not overwritten", async () => {
  const tp: TaskPlan = { ...plan.tasks[0], op: "update", rowAppEditedAt: null };
  const { tx, calls } = fakeTx({ appEditedAt: new Date("2026-10-25T10:00:00Z") });
  await assert.rejects(writeTask(tx, tp), StalePlanError);
  // One conditional statement, never a read and then a separate write.
  const writes = calls.filter((c) => c.model === "task" && /update/.test(c.op));
  assert.deepEqual(writes.map((c) => c.op), ["updateMany"]);
  assert.deepEqual((writes[0].args as { where: unknown }).where, { id: tp.taskId, appEditedAt: null });
});

test("an update matching the planned appEditedAt is written", async () => {
  const at = "2026-10-25T10:00:00.000Z";
  const tp: TaskPlan = { ...plan.tasks[0], op: "update", rowAppEditedAt: at };
  const { tx } = fakeTx({ appEditedAt: new Date(at) });
  const r = await writeTask(tx, tp);
  assert.equal(r.created, false);
});

test("Asana's own next copy of a repeating job joins the series, without email", async () => {
  const done = plan.tasks.find((t) => t.contactId)!;
  const tp: TaskPlan = { ...plan.tasks.find((t) => t.taskId !== done.taskId)!, op: "create", seriesFrom: done.taskId };
  const { tx, calls } = fakeTx();
  const r = await writeTask(tx, tp);
  assert.equal(r.joinedSeriesOf, done.taskId);
  assert.equal(r.nextRepeatId, null);
  const created = calls.find((c) => c.model === "taskEvent" && c.op === "create" && (c.args as { data: { kind: string } }).data.kind === "CREATED")!;
  assert.equal((created.args as { data: { data: { repeatOf: string } } }).data.data.repeatOf, done.taskId);
  const joined = calls.find((c) => c.model === "task" && c.op === "update" && (c.args as { where: { id: string } }).where.id === tp.taskId)!;
  assert.deepEqual((joined.args as { data: unknown }).data, { repeatRule: { freq: "monthly", interval: 1 }, repeatSeriesId: done.taskId });
  assert.ok(calls.some((c) => c.model === "taskEvent" && (c.args as { data?: { kind?: string } }).data?.kind === "REPEAT_CREATED"));
});

test("events are append-only by story gid: ones already stored aren't written again", async () => {
  const tp = plan.tasks.find((t) => t.events.length > 3)!;
  const { tx, calls } = fakeTx();
  const orig = (tx as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>).taskEvent;
  const stored = tp.events.map((e) => ({ asanaStoryGid: e.asanaStoryGid }));
  const proxied = new Proxy(orig, {
    get(target, op: string) {
      if (op === "findMany") return async () => stored;
      if (op === "findFirst") return async () => ({ id: "created-before" });
      return target[op];
    },
  });
  const wrapped = new Proxy(tx as object, { get: (t, k: string) => (k === "taskEvent" ? proxied : (t as Record<string, unknown>)[k]) }) as Tx;
  const r = await writeTask(wrapped, { ...tp, op: "update", rowAppEditedAt: null });
  assert.equal(r.eventsAdded, 0);
  assert.ok(!calls.some((c) => c.model === "taskEvent" && (c.op === "createMany" || c.op === "create")));
});

// A static check on top: no importer file names the outbox or a core write that notifies.
const NOTIFYING_NAME = /notificationOutbox|NotificationOutbox|\benqueue\(|\bcore\.(createTask|setStatus|toggleDone|patchTask|addComment|recordAttachment)\b/;
// Any specifier that resolves to core or service: "@/lib/tasks/core", "../../src/lib/tasks/core", with or without .ts.
const NOTIFYING_IMPORT = /import\s*\{[^}]*\b(createTask|setStatus|toggleDone|patchTask|addComment|recordAttachment)\b[^}]*\}\s*from\s*["'][^"']*lib\/tasks\/(core|service)(\.ts)?["']/;

test("the static check catches a notifying import however it's spelled", () => {
  for (const src of [
    `import { setStatus } from "@/lib/tasks/core";`,
    `import { addEvent, createTask } from "../../src/lib/tasks/service";`,
    `import {\n  toggleDone,\n} from '../../../src/lib/tasks/core.ts';`,
  ]) {
    assert.ok(NOTIFYING_IMPORT.test(src), src);
  }
  assert.ok(!NOTIFYING_IMPORT.test(`import { addEvent, createNextRepeat, grantAssigneeAccess } from "@/lib/tasks/core";`));
});

test("no importer file reaches for the outbox or a notifying core write", () => {
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) dir = path.dirname(dir);
  const files = [
    ...fs.readdirSync(path.join(dir, "src/lib/asana"), { recursive: true }).map((f) => path.join(dir, "src/lib/asana", String(f))),
    ...fs.readdirSync(path.join(dir, "scripts/asana"), { recursive: true }).map((f) => path.join(dir, "scripts/asana", String(f))),
  ].filter((f) => /\.ts$/.test(f) && !f.endsWith(".test.ts"));
  assert.ok(files.length >= 4);
  const offenders = files.filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return NOTIFYING_NAME.test(src) || NOTIFYING_IMPORT.test(src);
  });
  assert.deepEqual(offenders.map((f) => path.relative(dir, f)), []);
});
