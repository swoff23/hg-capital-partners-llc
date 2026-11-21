import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { toYmd } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { createLease } from "@/lib/tenants/core";
import { TaskRuleError, type Principal } from "./core";
import { applyPlaybookWith, type PlaybookRow } from "./templates-core";

/**
 * Applying a playbook with its lease box on a real Postgres
 * (docs/specs/tenants.md section 9): a move-in creates the upcoming lease
 * with the tasks, a move-out sets the household's Moves out, a refused lease
 * write creates no tasks, a failed task takes the lease back, and a second
 * Apply at once waits and is refused. Opt-in like core.pg.test.ts in tenants:
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch") with the migrations applied. It
 * removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_tenants_scratch npx tsx --test src/lib/tasks/templates-core.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";

let prisma: PrismaClient;
/** This file's turn on the scratch database, and what it makes there, deleted when it finishes (scratch-rows.ts). */
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
const propertyIds: string[] = [];
let staff: Principal;
let staffId: string;
let moveIn: string;
let moveOut: string;

/** Nov 20, 2026 in Buffalo: the day these Applies happen. */
const NOW = new Date("2026-11-20T17:00:00Z");
const name = (s: string) => `${run} ${s}`;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  const user = await made.user({ email: `${run}@example.com`, name: `${run} Connor` });
  staffId = user.id;
  staff = { kind: "staff", userId: user.id, label: "Connor" };
  const items = [
    { title: "Collect the deposit from [Tenant]", dueOffsetDays: -3 },
    { title: "Hand [Tenant] the keys", dueOffsetDays: 0 },
  ];
  moveIn = (await made.taskTemplate({ name: `${run} New tenant`, anchorLabel: "Move-in date", items })).id;
  moveOut = (await made.taskTemplate({ name: `${run} Move out`, anchorLabel: "Move-out date", items })).id;
});

after(async () => {
  if (skip) return;
  // Leases hold their property (onDelete Restrict), so they go before scratchRows removes the properties.
  await prisma.lease.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.tenant.deleteMany({ where: { fullName: { startsWith: run } } });
  await made.remove();
  await prisma.$disconnect();
});

async function property(units: { id?: string; label: string }[]): Promise<string> {
  const p = await made.property({ address: `${run} ${propertyIds.length} Test St`, units });
  propertyIds.push(p.id);
  return p.id;
}

/** The two tasks as the review step sends them, the tenant filled in. */
const rows = (tenant: string, anchor: string): PlaybookRow[] => [
  { title: `Collect the deposit from ${tenant}`, assignee: null, dueDate: anchor },
  { title: `Hand ${tenant} the keys`, assignee: null, dueDate: anchor },
];

const tasksFrom = (templateId: string, propertyId: string) => prisma.task.count({ where: { taskTemplateId: templateId, propertyId } });

async function leaseRefusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof FieldError) return err.fieldErrors.lease;
    throw err;
  }
  assert.fail("expected the lease to be refused");
}

test("move-in: Apply creates the upcoming lease and the tasks together", { skip }, async () => {
  // Rear predates unit ids: the lease's write gives every unit a lasting one first.
  const pid = await property([{ id: "front", label: "Front" }, { label: "Rear" }]);
  const done = await applyPlaybookWith(
    prisma,
    moveIn,
    { propertyId: pid, unitLabel: "Rear", rows: rows("Dana Lee", "2026-12-01"), lease: { kind: "move-in", name: ` ${name("Dana  Lee")} `, phone: "716 555 1234", on: "2026-12-01" } },
    staff,
    NOW,
  );
  assert.equal(done.count, 2);
  assert.deepEqual(done.lease, { kind: "move-in", name: name("Dana Lee") });
  assert.ok(done.leaseId);

  const units = (await prisma.property.findUniqueOrThrow({ where: { id: pid } })).units as { id?: string; label: string }[];
  const rear = units.find((u) => u.label === "Rear")!;
  assert.ok(rear.id && !rear.id.startsWith("unit-at-"), "Rear has a lasting id");

  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: done.leaseId! },
    include: { tenants: { include: { tenant: true } }, terms: true },
  });
  assert.equal(lease.source, "PLAYBOOK");
  assert.equal(lease.unitId, rear.id);
  assert.equal(lease.unitLabel, "Rear");
  assert.equal(toYmd(lease.movesIn), "2026-12-01");
  assert.equal(lease.movesOut, null);
  assert.equal(lease.createdByUserId, staffId);
  assert.equal(lease.terms.length, 0, "no term yet: the lease page asks for the signed lease");
  assert.deepEqual(
    lease.tenants.map((t) => [t.tenant.fullName, t.primary, t.tenant.phoneE164]),
    [[name("Dana Lee"), true, "+17165551234"]],
  );

  const tasks = await prisma.task.findMany({ where: { taskTemplateId: moveIn, propertyId: pid }, select: { unitLabel: true } });
  assert.deepEqual(tasks.map((t) => t.unitLabel), ["Rear", "Rear"]);
});

test("move-out: Apply sets the living lease's Moves out, for everyone on it", { skip }, async () => {
  // One unit and none picked: the property's one unit is the home.
  const pid = await property([{ id: "main", label: "1" }]);
  const { id } = await createLease(
    prisma,
    { propertyId: pid, unitId: "main", tenants: [{ new: { fullName: name("Dana Lee") } }, { new: { fullName: name("Sam Ortiz") } }], movesIn: "2025-06-01" },
    null,
  );
  const done = await applyPlaybookWith(prisma, moveOut, { propertyId: pid, unitLabel: null, rows: rows("Dana Lee", "2026-12-31"), lease: { kind: "move-out", on: "2026-12-31" } }, staff, NOW);
  assert.equal(done.count, 2);
  assert.equal(done.leaseId, id);
  assert.deepEqual(done.lease, { kind: "move-out", names: [name("Dana Lee"), name("Sam Ortiz")], movesOut: "2026-12-31" });
  const lease = await prisma.lease.findUniqueOrThrow({ where: { id }, select: { movesIn: true, movesOut: true, _count: { select: { tenants: true } } } });
  assert.equal(toYmd(lease.movesOut), "2026-12-31");
  assert.equal(toYmd(lease.movesIn), "2025-06-01");
  assert.equal(lease._count.tenants, 2);
  assert.equal(await tasksFrom(moveOut, pid), 2);
});

test("a refused lease write creates no tasks, and says why in a line short enough for a phone", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  const living = await createLease(prisma, { propertyId: pid, unitId: "front", tenants: [{ new: { fullName: name("Amy Chen") } }], movesIn: "2025-06-01" }, null);

  // A second household at Front while Amy has no move-out: the overlap the tenants rules refuse.
  const overlap = await leaseRefusal(
    applyPlaybookWith(
      prisma,
      moveIn,
      { propertyId: pid, unitLabel: "Front", rows: rows("Dana Lee", "2026-12-01"), lease: { kind: "move-in", name: name("Dana Lee"), on: "2026-12-01" } },
      staff,
      NOW,
    ),
  );
  assert.equal(overlap, "Front has another lease then.");

  // A number the tenants rules can't read.
  const phone = await leaseRefusal(
    applyPlaybookWith(
      prisma,
      moveIn,
      { propertyId: pid, unitLabel: "Rear", rows: rows("Dana Lee", "2026-12-01"), lease: { kind: "move-in", name: name("Dana Lee"), phone: "555", on: "2026-12-01" } },
      staff,
      NOW,
    ),
  );
  assert.equal(phone, "Enter their full phone number.");

  // A move-out on or before the household moved in.
  const early = await leaseRefusal(
    applyPlaybookWith(prisma, moveOut, { propertyId: pid, unitLabel: "Front", rows: rows("Amy Chen", "2025-05-01"), lease: { kind: "move-out", on: "2025-05-01" } }, staff, NOW),
  );
  assert.equal(early, "They moved in Jun 1, 2025.");

  // Nobody living at Rear to move out.
  const vacant = await leaseRefusal(
    applyPlaybookWith(prisma, moveOut, { propertyId: pid, unitLabel: "Rear", rows: rows("Amy Chen", "2026-12-31"), lease: { kind: "move-out", on: "2026-12-31" } }, staff, NOW),
  );
  assert.equal(vacant, "Nobody lives at Rear now.");
  // Each fits beside the way through the page adds on a 375 phone (UNTICK_LEASE_SHORT, never cut).
  for (const line of [overlap, phone, early, vacant]) assert.ok(line.length <= 30, line);

  // Nothing of any of it was kept: no tasks, no new lease or tenant, Amy's stay as it was.
  assert.equal(await tasksFrom(moveIn, pid), 0);
  assert.equal(await tasksFrom(moveOut, pid), 0);
  assert.equal(await prisma.lease.count({ where: { propertyId: pid } }), 1);
  assert.equal(await prisma.tenant.count({ where: { fullName: name("Dana Lee"), leases: { some: { lease: { propertyId: pid } } } } }), 0);
  assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: living.id } })).movesOut, null);

  // Unticked, the same Apply goes through and leaves the leases alone.
  const plain = await applyPlaybookWith(prisma, moveIn, { propertyId: pid, unitLabel: "Front", rows: rows("Dana Lee", "2026-12-01") }, staff, NOW);
  assert.deepEqual([plain.count, plain.lease, plain.leaseId], [2, null, null]);
  assert.equal(await prisma.lease.count({ where: { propertyId: pid } }), 1);
});

test("a task that fails after the lease is written takes the lease back with it", { skip }, async () => {
  // Rear predates unit ids, so the lease's write gives the units ids first: those go back too.
  const pid = await property([{ id: "front", label: "Front" }, { label: "Rear" }]);
  // Postgres refuses a NUL in text, so the second task's write fails after the lease and the first task.
  const failing: PlaybookRow[] = [...rows("Dana Lee", "2026-12-01").slice(0, 1), { title: "Hand Dana Lee the keys\u0000", assignee: null, dueDate: "2026-12-01" }];
  await assert.rejects(
    applyPlaybookWith(prisma, moveIn, { propertyId: pid, unitLabel: "Rear", rows: failing, lease: { kind: "move-in", name: name("Dana Lee"), on: "2026-12-01" } }, staff, NOW),
    /0x00/,
  );
  assert.equal(await prisma.lease.count({ where: { propertyId: pid } }), 0, "no lease left behind with no tasks");
  assert.equal(await prisma.tenant.count({ where: { fullName: name("Dana Lee"), leases: { some: { lease: { propertyId: pid } } } } }), 0);
  assert.equal(await tasksFrom(moveIn, pid), 0);
  const units = (await prisma.property.findUniqueOrThrow({ where: { id: pid } })).units as { id?: string; label: string }[];
  assert.equal(units.find((u) => u.label === "Rear")?.id, undefined, "Rear's new id went back with the rest");

  // The retry, fixed, isn't refused by a lease the failed one left.
  const done = await applyPlaybookWith(prisma, moveIn, { propertyId: pid, unitLabel: "Rear", rows: rows("Dana Lee", "2026-12-01"), lease: { kind: "move-in", name: name("Dana Lee"), on: "2026-12-01" } }, staff, NOW);
  assert.equal(done.count, 2);
  assert.equal(await prisma.lease.count({ where: { propertyId: pid } }), 1);
});

/** Backends on this database waiting on a row another holds; a database test waiting for its turn (an advisory lock) isn't one. */
async function rowWaiters(): Promise<number> {
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event <> 'advisory'`;
  return n;
}

/** Waits until `n` backends wait on a row, or `ended` says the write that would wait finished first. */
async function untilWaiting(n: number, ended: () => boolean): Promise<boolean> {
  for (let i = 0; i < 400; i++) {
    if ((await rowWaiters()) >= n) return true;
    if (ended()) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

/** How an Apply ended, so one still running can be waited on later without an unhandled rejection. */
const outcome = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: Error) => (e instanceof FieldError ? e.fieldErrors.lease : e.message),
  );

test("a second Apply while the first is still writing its tasks waits for it, then is refused, not doubled", { skip, timeout: 30_000 }, async () => {
  const pid = await property([{ id: "front", label: "Front" }]);
  const plan = { propertyId: pid, unitLabel: "Front", rows: rows("Dana Lee", "2026-12-01"), lease: { kind: "move-in" as const, name: name("Dana Lee"), on: "2026-12-01" } };

  // The playbook's row, held: each Apply's first task names it (a foreign key's key-share lock), so the first one
  // stops there with its lease written and not yet committed, as a slow Apply of a few dozen tasks is.
  let held!: () => void;
  let release!: () => void;
  const holding = new Promise<void>((r) => (held = r));
  const gate = new Promise<void>((r) => (release = r));
  const hold = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "TaskTemplate" WHERE "id" = ${moveIn} FOR UPDATE`;
      held();
      await gate;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  let first: Promise<string> | null = null;
  let second: Promise<string> | null = null;
  try {
    await holding;
    let firstEnded = false;
    first = outcome(applyPlaybookWith(prisma, moveIn, plan, staff, NOW));
    void first.then(() => (firstEnded = true));
    assert.ok(await untilWaiting(1, () => firstEnded), "the first Apply never reached its tasks");

    // The retry. Without the property's lock it passes the overlap check beside the first, uncommitted lease.
    let secondEnded = false;
    second = outcome(applyPlaybookWith(prisma, moveIn, plan, staff, NOW));
    void second.then(() => (secondEnded = true));
    assert.ok(await untilWaiting(2, () => secondEnded), `the second Apply never waited: ${secondEnded ? await second : "still running"}`);
  } finally {
    // Let go however the wait ended, and see every write out before the client disconnects.
    release();
    await hold;
    await first;
    await second;
  }
  assert.equal(await first, "ok");
  assert.equal(await second, "Front has another lease then.");
  assert.equal(await prisma.lease.count({ where: { propertyId: pid } }), 1, "one lease for Dana Lee, not two");
  assert.equal(await tasksFrom(moveIn, pid), 2, "the first Apply's tasks, and none from the second");
});

test("a lease box the playbook's date doesn't call for is refused before anything is written", { skip }, async () => {
  const pid = await property([{ id: "u", label: "1" }]);
  await assert.rejects(
    applyPlaybookWith(prisma, moveIn, { propertyId: pid, rows: rows("Dana Lee", "2026-12-31"), lease: { kind: "move-out", on: "2026-12-31" } }, staff, NOW),
    TaskRuleError,
  );
  assert.equal(await tasksFrom(moveIn, pid), 0);
});
