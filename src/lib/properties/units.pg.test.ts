import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { toYmd } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import type { PropertyUnit } from "@/lib/property-types";
import { scratchRows } from "@/lib/scratch-rows";
import type { Principal } from "@/lib/tasks/core";
import { UNIT_GONE, createLease, createLeaseIn, patchLease } from "@/lib/tenants/core";
import { writeUnitsTx } from "./units-write";

/**
 * The units write and the leases on those units, on a real Postgres
 * (docs/specs/tenants.md section 3 and decision 6): a rename reaches every
 * lease on the unit by its id, and a unit with current or upcoming tenants
 * can't be deleted. Opt-in like tenants/core.pg.test.ts, by the same guard:
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch") with the migrations applied. It
 * takes its turn on that database and removes what it adds (scratch-rows.ts).
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_tenants_scratch npx tsx --test src/lib/properties/units.pg.test.ts
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

/** Buffalo's today as every test here sees it, so a lease's status never depends on when the suite runs. */
const TODAY = "2026-11-14";

let prisma: PrismaClient;
/** This file's turn on the scratch database, and what it makes there, deleted when it finishes (scratch-rows.ts). */
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
const propertyIds: string[] = [];
let staff: Principal;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  const connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
});

after(async () => {
  if (skip) return;
  // A lease holds its property (onDelete: Restrict), so the leases and their tenants go first.
  await prisma.lease.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.tenant.deleteMany({ where: { fullName: { startsWith: run } } });
  await made.remove();
  await prisma.$disconnect();
});

async function property(units: { id: string; label: string }[]): Promise<string> {
  const p = await made.property({ address: `${run} ${propertyIds.length} Units St`, units });
  propertyIds.push(p.id);
  return p.id;
}

async function lease(propertyId: string, unitId: string, movesIn: string, movesOut?: string): Promise<string> {
  const { id } = await createLease(prisma, { propertyId, unitId, tenants: [{ new: { fullName: `${run} Tenant` } }], movesIn, movesOut }, null);
  return id;
}

/** One units save as the service makes it, at the property's version now. */
async function save(propertyId: string, next: (stored: PropertyUnit[]) => PropertyUnit[]) {
  const { updatedAt } = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { updatedAt: true } });
  return prisma.$transaction((tx) => writeUnitsTx(tx, propertyId, updatedAt.toISOString(), staff, null, next, { today: TODAY }));
}

async function leaseLabels(propertyId: string): Promise<Record<string, string | null>> {
  const rows = await prisma.lease.findMany({ where: { propertyId }, select: { id: true, unitLabel: true } });
  return Object.fromEntries(rows.map((l) => [l.id, l.unitLabel]));
}

/** Whether some other connection is waiting on a lock the backend `pid` holds. */
async function waitedOn(pid: number, ended: () => boolean): Promise<boolean> {
  for (let i = 0; i < 400; i++) {
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND ${pid}::int = ANY(pg_blocking_pids(pid))`;
    if (n > 0) return true;
    // The other side finished without waiting.
    if (ended()) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

/** How a write ended, so one still running can be waited on later without an unhandled rejection. */
const outcome = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);

const renamed = (id: string, label: string) => (stored: PropertyUnit[]) => stored.map((u) => (u.id === id ? { ...u, label } : u));
const without = (id: string) => (stored: PropertyUnit[]) => stored.filter((u) => u.id !== id);

test("a rename reaches every lease on the unit by its id, past leases included", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  const past = await lease(pid, "front", "2020-01-01", "2021-01-01");
  const now = await lease(pid, "front", "2025-03-01");
  const rear = await lease(pid, "rear", "2025-06-01");
  const written = await save(pid, renamed("front", "Upstairs"));
  assert.deepEqual(await leaseLabels(pid), { [past]: "Upstairs", [now]: "Upstairs", [rear]: "Rear" });
  // The leases it changed, for their pages; the one on Rear didn't change.
  assert.deepEqual([...written.leases].sort(), [past, now].sort());
  // A save that renames nothing touches no lease.
  assert.deepEqual((await save(pid, (stored) => stored)).leases, []);
});

test("two units swapping names swap their leases, tasks and listings", { skip }, async () => {
  const pid = await property([{ id: "a", label: "Front" }, { id: "b", label: "Rear" }]);
  const onA = await lease(pid, "a", "2025-01-01");
  const onB = await lease(pid, "b", "2025-01-01");
  const task = await prisma.task.create({ data: { title: `${run} Fix the sink`, propertyId: pid, unitLabel: "Front" } });
  const listing = await prisma.listing.create({ data: { propertyId: pid, unitLabel: "Rear" } });
  await save(pid, (stored) => stored.map((u) => ({ ...u, label: u.id === "a" ? "Rear" : "Front" })));
  assert.deepEqual(await leaseLabels(pid), { [onA]: "Rear", [onB]: "Front" });
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).unitLabel, "Rear");
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).unitLabel, "Front");
});

test("deleting a unit with current tenants is refused with decision 6's line", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  // Moving out after today and another household moving in that day: the current one decides the line.
  await lease(pid, "front", "2025-03-01", "2026-12-01");
  await lease(pid, "front", "2026-12-01");
  await assert.rejects(save(pid, without("front")), { message: "Front has current tenants. End their lease first." });
  // An imported lease with no dates lives there now.
  await lease(pid, "rear", "");
  await assert.rejects(save(pid, without("rear")), { message: "Rear has current tenants. End their lease first." });
});

test("deleting a unit with only an upcoming household is refused with when they move in", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }, { id: "side", label: "" }]);
  await lease(pid, "rear", "2027-02-01");
  await lease(pid, "rear", "2026-12-01", "2027-02-01");
  await assert.rejects(save(pid, without("rear")), { message: "Rear has tenants moving in Dec 1. Delete their lease first." });
  // A unit with no name goes by its place, as the Units editor shows it.
  await lease(pid, "side", "2027-02-01");
  await assert.rejects(save(pid, without("side")), { message: "Unit 3 has tenants moving in Feb 1, 2027. Delete their lease first." });
});

test("a unit with only past leases may be deleted, and they keep its id and name", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  const old = await lease(pid, "front", "2020-01-01", "2021-01-01");
  // Moving out today is past.
  const left = await lease(pid, "front", "2021-01-01", TODAY);
  const written = await save(pid, without("front"));
  assert.deepEqual(written.leases, []);
  const units = (await prisma.property.findUniqueOrThrow({ where: { id: pid }, select: { units: true } })).units as PropertyUnit[];
  assert.deepEqual(units.map((u) => u.id), ["rear"]);
  const rows = await prisma.lease.findMany({ where: { id: { in: [old, left] } }, select: { unitId: true, unitLabel: true } });
  assert.deepEqual(rows, [{ unitId: "front", unitLabel: "Front" }, { unitId: "front", unitLabel: "Front" }]);
  // A later save with that unit gone leaves the history as it reads.
  await save(pid, renamed("rear", "Back"));
  assert.deepEqual(await prisma.lease.findMany({ where: { id: { in: [old, left] } }, select: { unitLabel: true } }), [{ unitLabel: "Front" }, { unitLabel: "Front" }]);
});

test("a refused delete changes nothing: units, tasks, listings and leases stay as they were", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  const living = await lease(pid, "front", "2025-03-01");
  const onRear = await lease(pid, "rear", "2025-03-01");
  const task = await prisma.task.create({ data: { title: `${run} Paint the porch`, propertyId: pid, unitLabel: "Rear" } });
  const listing = await prisma.listing.create({ data: { propertyId: pid, unitLabel: "Rear" } });
  const snapshot = async () => ({
    property: await prisma.property.findUniqueOrThrow({ where: { id: pid }, select: { units: true, unitCount: true, updatedAt: true, updatedByUserId: true } }),
    task: await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { unitLabel: true, updatedAt: true } }),
    events: await prisma.taskEvent.count({ where: { taskId: task.id } }),
    listing: await prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, select: { unitLabel: true, updatedAt: true } }),
    leases: await prisma.lease.findMany({ where: { id: { in: [living, onRear] } }, select: { id: true, unitId: true, unitLabel: true, updatedAt: true }, orderBy: { id: "asc" } }),
  });
  const was = await snapshot();
  // One save that renames Rear, which would move its task, listing and lease, and deletes Front, which has tenants.
  await assert.rejects(
    save(pid, (stored) => without("front")(stored).map((u) => ({ ...u, label: "Back" }))),
    { message: "Front has current tenants. End their lease first." },
  );
  assert.deepEqual(await snapshot(), was);
});

test("a lease still being saved when a delete starts holds the delete, which then refuses", { skip, timeout: 30_000 }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
  // A lease on Front inserted but not yet committed, with its backend's pid.
  let inserted!: (backend: number) => void;
  let release!: () => void;
  const atHold = new Promise<number>((r) => (inserted = r));
  const gate = new Promise<void>((r) => (release = r));
  const leasing = outcome(
    prisma.$transaction(
      async (tx) => {
        await createLeaseIn(tx, { propertyId: pid, unitId: "front", tenants: [{ new: { fullName: `${run} Tenant` } }], movesIn: "2025-03-01" }, null);
        const [{ backend }] = await tx.$queryRaw<{ backend: number }[]>`SELECT pg_backend_pid() AS backend`;
        inserted(backend);
        await gate;
      },
      { maxWait: 10_000, timeout: 20_000 },
    ),
  );
  let deleting: Promise<string> | null = null;
  let waited = false;
  try {
    const backend = await Promise.race([atHold, leasing]);
    assert.equal(typeof backend, "number", `the lease ended before it held: ${backend}`);
    let ended = false;
    deleting = outcome(save(pid, without("front")));
    void deleting.then(() => (ended = true));
    waited = await waitedOn(backend as number, () => ended);
  } finally {
    // Let go however the wait ended, and see both writes out before the client disconnects.
    release();
    await leasing;
    await deleting;
  }
  assert.ok(waited, "the delete never waited on the lease being saved");
  assert.equal(await leasing, "ok");
  assert.equal(await deleting, "Front has current tenants. End their lease first.");
  const units = (await prisma.property.findUniqueOrThrow({ where: { id: pid }, select: { units: true } })).units as PropertyUnit[];
  assert.deepEqual(units.map((u) => u.id), ["front", "rear"]);
});

test(
  "a lease that read the units before a delete committed can't land on the unit it deleted",
  { skip, timeout: 30_000 },
  async () => {
    const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
    const { updatedAt } = await prisma.property.findUniqueOrThrow({ where: { id: pid }, select: { updatedAt: true } });
    let leasing: Promise<string> | null = null;
    let waited = false;
    // The delete has run its check and its write and not yet committed when the lease starts.
    await prisma.$transaction(
      async (tx) => {
        await writeUnitsTx(tx, pid, updatedAt.toISOString(), staff, null, without("front"), { today: TODAY });
        const [{ backend }] = await tx.$queryRaw<{ backend: number }[]>`SELECT pg_backend_pid() AS backend`;
        let ended = false;
        leasing = outcome(createLease(prisma, { propertyId: pid, unitId: "front", tenants: [{ new: { fullName: `${run} Tenant` } }], movesIn: "2025-03-01" }, null));
        void leasing.then(() => (ended = true));
        waited = await waitedOn(backend, () => ended);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    assert.ok(waited, "the lease never waited on the delete");
    assert.equal(await leasing, UNIT_GONE);
  },
);

test(
  "a past lease on a deleted unit can't be reopened, so the unit never has tenants again",
  { skip },
  async () => {
    const pid = await property([{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }]);
    const old = await lease(pid, "front", "2020-01-01", "2021-01-01");
    await save(pid, without("front"));
    // Clearing Moves out would make them live at Front now.
    await assert.rejects(patchLease(prisma, old, { movesOut: null }), FieldError);
    assert.equal(toYmd((await prisma.lease.findUniqueOrThrow({ where: { id: old }, select: { movesOut: true } })).movesOut), "2021-01-01");
  },
);
