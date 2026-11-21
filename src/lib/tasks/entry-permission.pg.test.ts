import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { createLease } from "@/lib/tenants/core";
import { createNextRepeat, createTask, patchTask, type Principal } from "./core";

/**
 * Permission to enter on a real Postgres (docs/specs/tenants.md section 8):
 * New task saves it only at an occupied home, the task page's switch writes
 * the server's clock with an Internal ACCESS line and no email, a unit change
 * clears it, an assignee change keeps it, a new household voids an old yes,
 * and a repeat starts without it. Opt-in like core.pg.test.ts in tenants:
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch") with the migrations applied. It
 * removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_tasks_scratch npx tsx --test src/lib/tasks/entry-permission.pg.test.ts
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
const contactIds: string[] = [];
let staff: Principal;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  const user = await prisma.user.create({ data: { email: `${run}@example.com`, name: `${run} Connor` } });
  staff = { kind: "staff", userId: user.id, label: "Connor" } as Principal;
});

after(async () => {
  if (skip) return;
  await prisma.task.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.lease.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.tenant.deleteMany({ where: { fullName: { startsWith: run } } });
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.user.deleteMany({ where: { email: `${run}@example.com` } });
  await made.remove();
  await prisma.$disconnect();
});

/** A duplex: Front has Dana living there since 2025, Rear is vacant. */
async function duplex(): Promise<string> {
  const p = await prisma.property.create({
    data: {
      address: `${run} ${propertyIds.length} Test St`,
      units: [
        { id: "front", label: "Front", lockboxCode: "2374" },
        { id: "rear", label: "Rear", lockboxCode: "4857" },
      ],
    },
  });
  propertyIds.push(p.id);
  await createLease(prisma, { propertyId: p.id, unitId: "front", tenants: [{ new: { fullName: `${run} Dana Lee` } }], movesIn: "2025-06-01" }, null);
  return p.id;
}

const accessLines = (taskId: string) =>
  prisma.taskEvent.findMany({ where: { taskId, kind: "ACCESS" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { data: true, visibility: true } });

test("New task saves Permission to enter only at a home somebody lives in", { skip }, async () => {
  const pid = await duplex();
  const now = new Date("2026-11-17T17:00:00Z");
  const front = await prisma.$transaction((tx) => createTask(tx, { title: "Faucet", propertyId: pid, unitLabel: "Front", entryPermitted: true }, staff, now));
  assert.equal(front.entryPermittedAt?.toISOString(), now.toISOString());
  assert.deepEqual(await accessLines(front.id), [{ data: { entry: { from: false, to: true } }, visibility: "INTERNAL" }]);

  const rear = await prisma.$transaction((tx) => createTask(tx, { title: "Porch", propertyId: pid, unitLabel: "Rear", entryPermitted: true }, staff, now));
  assert.equal(rear.entryPermittedAt, null, "vacant: nothing to permit");
  assert.deepEqual(await accessLines(rear.id), []);
});

test("the switch stamps the server's clock, writes a line and no email, and a pick that changes nothing writes nothing", { skip }, async () => {
  const pid = await duplex();
  const zack = await prisma.contact.create({ data: { fullName: `${run} Zack` } });
  contactIds.push(zack.id);
  const task = await prisma.$transaction((tx) => createTask(tx, { title: "Faucet", propertyId: pid, unitLabel: "Front", assignee: { contactId: zack.id } }, staff));
  const outboxBefore = await prisma.notificationOutbox.count({ where: { taskId: task.id } });

  const t1 = new Date("2026-11-17T17:00:00Z");
  const on = await prisma.$transaction((tx) => patchTask(tx, task.id, { entryPermitted: true }, staff, t1));
  assert.equal(on.entryPermittedAt?.toISOString(), t1.toISOString());
  await prisma.$transaction((tx) => patchTask(tx, task.id, { entryPermitted: true }, staff, new Date("2026-11-17T18:00:00Z")));
  const off = await prisma.$transaction((tx) => patchTask(tx, task.id, { entryPermitted: false }, staff));
  assert.equal(off.entryPermittedAt, null);
  assert.deepEqual(
    (await accessLines(task.id)).map((l) => l.data),
    [{ entry: { from: false, to: true } }, { entry: { from: true, to: false } }],
  );
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: task.id } }), outboxBefore, "no email for a switch");
});

test("a unit change clears it with its own line; an assignee change keeps it", { skip }, async () => {
  const pid = await duplex();
  const task = await prisma.$transaction((tx) => createTask(tx, { title: "Faucet", propertyId: pid, unitLabel: "Front", entryPermitted: true }, staff));
  const zack = await prisma.contact.create({ data: { fullName: `${run} Zack 2` } });
  contactIds.push(zack.id);
  const kept = await prisma.$transaction((tx) => patchTask(tx, task.id, { assignee: { contactId: zack.id } }, staff));
  assert.ok(kept.entryPermittedAt, "the tenants let HG in, not one person");
  const moved = await prisma.$transaction((tx) => patchTask(tx, task.id, { unitLabel: "Rear" }, staff));
  assert.equal(moved.entryPermittedAt, null);
  assert.deepEqual((await accessLines(task.id)).at(-1)?.data, { entry: { from: true, to: false }, cleared: "unit" });
});

test("a yes from the household before doesn't hold, so the switch reads off and turning it on stamps again", { skip }, async () => {
  const pid = await duplex();
  const task = await prisma.$transaction((tx) =>
    createTask(tx, { title: "Faucet", propertyId: pid, unitLabel: "Front", entryPermitted: true }, staff, new Date("2025-01-10T17:00:00Z")),
  );
  // Created before Dana moved in (June 2025): Front had no lease then, so nothing was saved.
  assert.equal(task.entryPermittedAt, null);
  await prisma.task.update({ where: { id: task.id }, data: { entryPermittedAt: new Date("2025-01-10T17:00:00Z") } });
  const now = new Date("2026-11-17T17:00:00Z");
  const again = await prisma.$transaction((tx) => patchTask(tx, task.id, { entryPermitted: true }, staff, now));
  assert.equal(again.entryPermittedAt?.toISOString(), now.toISOString());
  assert.deepEqual((await accessLines(task.id)).at(-1)?.data, { entry: { from: false, to: true } });
});

test("a repeat starts without it", { skip }, async () => {
  const pid = await duplex();
  const task = await prisma.$transaction((tx) =>
    createTask(tx, { title: "Filter", propertyId: pid, unitLabel: "Front", entryPermitted: true, repeatRule: { freq: "monthly", interval: 1, dayOfMonth: 1 } }, staff),
  );
  assert.ok(task.entryPermittedAt);
  const nextId = await prisma.$transaction((tx) => createNextRepeat(tx, task, staff, new Date()));
  const next = await prisma.task.findUniqueOrThrow({ where: { id: nextId! } });
  assert.equal(next.entryPermittedAt, null);
});
