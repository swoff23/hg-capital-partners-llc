import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as core from "@/lib/tasks/core";
import { postBatchIn } from "./job-batch";

/**
 * The batch step's races on a real Postgres, which a fake transaction can't
 * show: row locks, and who waits on whom. Opt-in, so `npm test` skips it
 * unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name
 * must contain "scratch"); it writes rows there and leaves them.
 *
 *   createdb -h localhost hg_batch_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_batch_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_batch_scratch npx tsx --test src/lib/portal/job-batch.pg.test.ts
 *   dropdb -h localhost hg_batch_scratch
 *
 * Each race holds the first transaction just after it links the files (their
 * rows locked), starts the second, waits until Postgres shows it waiting on
 * the first, then lets the first finish. The second must then find the files
 * taken and roll back whole, with no deadlock either way round: a late send
 * and an active send of the same files meet on the files' rows, because
 * core.addLateContractorBatch writes in addComment's order.
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole, so a query string or another host can't pass for one. */
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
/** Each test's own limit, so a race that never lets go fails instead of hanging the run. */
const timeout = 30_000;

let prisma: PrismaClient;
let staff: core.Principal;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = new PrismaClient({ datasourceUrl: URL_ENV });
  const run = randomUUID().slice(0, 8);
  // Two partners with a sign-in, so each late or batch line goes to both (core notify).
  const connor = await prisma.user.create({ data: { email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" } });
  await prisma.user.create({ data: { email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" } });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  const contact = await prisma.contact.create({ data: { fullName: "Zack Outlaw" } });
  await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE" },
  });
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Outlaw" };
  propertyId = (await prisma.property.create({ data: { address: `${run} Sherwood St, Buffalo, NY 14213` } })).id;
});

after(async () => {
  if (!skip) await prisma.$disconnect();
});

/** A job assigned to Zack in `status`, with `n` photos he uploaded and hasn't posted. */
async function jobWithFiles(status: "IN_PROGRESS" | "DONE" | "CANCELED", n = 2): Promise<{ taskId: string; files: string[] }> {
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Tile the bath", propertyId, assignee: { contactId: zack.contactId } }, staff));
  await prisma.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
  const files: string[] = [];
  for (let i = 0; i < n; i++) {
    const pathname = `tasks/${task.id}/orig/photo-${i}-${randomUUID()}.jpg`;
    const att = await prisma.$transaction((tx) =>
      core.recordAttachment(
        tx,
        task.id,
        { url: `https://store.private.blob.vercel-storage.com/${pathname}`, pathname, filename: `photo-${i}.jpg`, size: 1000, contentType: "image/jpeg" },
        zack,
        { visibility: "SHARED", standalone: false },
      ),
    );
    files.push(att.id);
  }
  if (status !== "IN_PROGRESS") await prisma.task.update({ where: { id: task.id }, data: { status } });
  return { taskId: task.id, files };
}

/**
 * Wraps a transaction client so each answer of `model.op` is kept in `seen`, and the first one stops there until
 * `release` is called (released before the transaction starts, it only watches). `pid` is the held transaction's
 * backend, for someoneWaits.
 */
function holdAfter(model: string, op: string) {
  let reached!: () => void;
  let release!: () => void;
  const atHold = new Promise<void>((r) => (reached = r));
  const gate = new Promise<void>((r) => (release = r));
  const seen: unknown[] = [];
  let pid = 0;
  const wrap = (tx: core.Tx): core.Tx =>
    new Proxy(tx, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop !== model) return typeof value === "function" ? value.bind(target) : value;
        const delegate = value as Record<string, (...args: unknown[]) => Promise<unknown>>;
        return new Proxy(delegate, {
          get(d, name) {
            const fn = d[name as string];
            if (name !== op) return typeof fn === "function" ? fn.bind(d) : fn;
            return async (...args: unknown[]) => {
              const out = await fn.apply(d, args);
              seen.push(out);
              if (seen.length === 1) {
                const [row] = await target.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
                pid = row.pid;
                reached();
                await gate;
              }
              return out;
            };
          },
        });
      },
    });
  return { wrap, atHold, release, seen, pid: () => pid };
}

type Outcome = { ok: true; value: unknown } | { ok: false; message: string };

/** Waits for the hold, and fails at once if the transaction ended before it got there (it would never be released). */
async function reach(hold: { atHold: Promise<void> }, run: Promise<Outcome>): Promise<void> {
  const first = await Promise.race([hold.atHold.then(() => null), run]);
  if (first !== null) throw new Error(`the transaction ended before the hold: ${JSON.stringify(first)}`);
}

/** Resolves once another transaction is waiting on a lock the held one (`pid`) holds. */
async function someoneWaits(pid: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND ${pid}::int = ANY(pg_blocking_pids(pid))`;
    if (n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`the second transaction never waited on the first (backend ${pid})`);
}

const LONG = { maxWait: 10_000, timeout: 20_000 };

async function lines(taskId: string) {
  const events = await prisma.taskEvent.findMany({ where: { taskId, kind: "COMMENT" }, select: { id: true, data: true } });
  const files = await prisma.taskAttachment.findMany({ where: { taskId }, select: { eventId: true } });
  const rows = await prisma.$queryRaw<{ items: { kind: string; eventId?: string }[] }[]>`
    SELECT "items" FROM "NotificationOutbox" WHERE "taskId" = ${taskId} AND "recipientUserId" IS NOT NULL`;
  return {
    events: events.map((e) => e.data),
    linkedTo: [...new Set(files.map((f) => f.eventId))],
    emailLines: rows.map((r) => r.items.filter((i) => i.kind === "COMMENT").map((i) => i.eventId)),
    eventIds: events.map((e) => e.id),
  };
}

/** What each partner's email bundle should hold: these lines, once per partner with a sign-in (earlier runs add more). */
async function perPartner(eventIds: string[]): Promise<string[][]> {
  const partners = await prisma.user.count({ where: { passwordHash: { not: null } } });
  return Array.from({ length: partners }, () => eventIds);
}

/** The files a post told HG of come in the database's order, not the send's: compared sorted. */
const sortLinked = (value: unknown) => {
  const v = value as { linked?: string[] } | null;
  return v && Array.isArray(v.linked) ? { ...v, linked: [...v.linked].sort() } : value;
};

const outcome = (p: Promise<unknown>): Promise<Outcome> =>
  p.then(
    (value) => ({ ok: true as const, value: sortLinked(value) }),
    (err: Error) => ({ ok: false as const, message: err.message }),
  );

/** What a late send answers: no event to undo, and the files it linked. */
const told = (files: string[]) => ({ ok: true, value: { event: null, linked: [...files].sort() } });

/** The status each read of the task saw, in order: the step's own, addComment's, the late batch's. */
const statuses = (seen: unknown[]) => seen.map((row) => (row as { status?: string } | null)?.status ?? null);

test("an active send holding the files and a late send of the same files: the late one waits, then rolls back whole", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("IN_PROGRESS");
  const hold = holdAfter("taskAttachment", "updateMany");
  try {
    const active = outcome(prisma.$transaction((tx) => postBatchIn(hold.wrap(tx), taskId, zack, files), LONG));
    await reach(hold, active);
    // HG approves while the batch is mid-post; a second send then reads the job Done and takes the late way.
    await prisma.task.update({ where: { id: taskId }, data: { status: "DONE" } });
    const late = outcome(prisma.$transaction((tx) => postBatchIn(tx, taskId, zack, files), LONG));
    await someoneWaits(hold.pid());
    hold.release();
    const [a, b] = await Promise.all([active, late]);
    assert.equal(a.ok, true, `the active send posts: ${JSON.stringify(a)}`);
    assert.deepEqual(b, { ok: false, message: "Write something or add a photo." }, "the files were taken, so it refuses and leaves nothing");
    const after = await lines(taskId);
    assert.deepEqual(after.events, [{ batch: true }], "one line, the active send's");
    assert.deepEqual(after.linkedTo, after.eventIds, "both files on that line");
    assert.deepEqual(after.emailLines, await perPartner(after.eventIds), "one email line per partner, the active send's");
  } finally {
    hold.release();
  }
});

test("a late send holding the files and an active send of the same files: the active one waits, then rolls back whole", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("DONE");
  const hold = holdAfter("taskAttachment", "updateMany");
  try {
    const late = outcome(prisma.$transaction((tx) => postBatchIn(hold.wrap(tx), taskId, zack, files), LONG));
    await reach(hold, late);
    // HG sends the job back to In progress meanwhile; a second send reads it active and posts as a batch.
    await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    const active = outcome(prisma.$transaction((tx) => postBatchIn(tx, taskId, zack, files), LONG));
    await someoneWaits(hold.pid());
    hold.release();
    const [l, a] = await Promise.all([late, active]);
    assert.deepEqual(l, told(files), "the late send tells HG of both files, with nothing to undo");
    assert.deepEqual(a, { ok: false, message: "Write something or add a photo." }, "the files were taken, so it refuses and leaves nothing");
    const after = await lines(taskId);
    assert.deepEqual(after.events, [{ late: true }], "one line, the late send's, never one an Undo takes back");
    assert.deepEqual(after.emailLines, await perPartner(after.eventIds), "one email line per partner, the late send's");
  } finally {
    hold.release();
  }
});

test("two late sends of the same files at once: one line and one email line each, the other rolls back", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("DONE", 3);
  const hold = holdAfter("taskAttachment", "updateMany");
  try {
    const first = outcome(prisma.$transaction((tx) => postBatchIn(hold.wrap(tx), taskId, zack, files), LONG));
    await reach(hold, first);
    const second = outcome(prisma.$transaction((tx) => postBatchIn(tx, taskId, zack, files), LONG));
    await someoneWaits(hold.pid());
    hold.release();
    const [one, two] = await Promise.all([first, second]);
    assert.deepEqual(one, told(files), "the first tells HG of all three");
    assert.deepEqual(two, { ok: false, message: "Write something or add a photo." }, "the second finds them taken and leaves nothing");
    const after = await lines(taskId);
    assert.deepEqual(after.events, [{ late: true }], "one late line");
    assert.deepEqual(after.linkedTo, after.eventIds, "all three files on the one line");
    assert.deepEqual(after.emailLines, await perPartner(after.eventIds), "one email line per partner");
    // The same send again later (its answer lost) has nothing new to say: quiet, and nothing more written.
    assert.deepEqual(await outcome(prisma.$transaction((tx) => postBatchIn(tx, taskId, zack, files))), told([]), "quiet, nothing counted");
    assert.deepEqual(await lines(taskId), after, "nothing more written");
  } finally {
    hold.release();
  }
});

test("an approve that commits between the step's status read and addComment's: the fallback, in the same transaction", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("IN_PROGRESS");
  // Held just after the step's own read of the job (the first task read), before addComment reads it again.
  const hold = holdAfter("task", "findUnique");
  try {
    const post = outcome(prisma.$transaction((tx) => postBatchIn(hold.wrap(tx), taskId, zack, files), LONG));
    await reach(hold, post);
    await prisma.task.update({ where: { id: taskId }, data: { status: "DONE" } });
    hold.release();
    assert.deepEqual(await post, told(files), "no batch to undo: the page says the photos were added");
    // The step read it active, so the late line can only have come from addComment's refusal: the fallback, not the direct path.
    assert.deepEqual(statuses(hold.seen), ["IN_PROGRESS", "DONE", "DONE"], "the step's read, addComment's, then the late batch's");
    const after = await lines(taskId);
    assert.deepEqual(after.events, [{ late: true }], "HG hears once, and no empty batch update was left");
    assert.deepEqual(after.linkedTo, after.eventIds, "both files on the late line");
    assert.deepEqual(after.emailLines, await perPartner(after.eventIds), "one email line per partner");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } }))?.status, "DONE", "the job stays Done");
  } finally {
    hold.release();
  }
});

test("a job canceled while the photos went up: the direct late path, HG hears once, and it stays Canceled", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("CANCELED", 3);
  // Released before the post starts: it only watches the task reads.
  const reads = holdAfter("task", "findUnique");
  reads.release();
  assert.deepEqual(await outcome(prisma.$transaction((tx) => postBatchIn(reads.wrap(tx), taskId, zack, files))), told(files), "no event to undo, all three told");
  assert.deepEqual(statuses(reads.seen), ["CANCELED", "CANCELED"], "the step's read and the late batch's: addComment never ran");
  const after = await lines(taskId);
  assert.deepEqual(after.events, [{ late: true }], "one late line, never one an Undo takes back");
  assert.deepEqual(after.linkedTo, after.eventIds, "all three files on it");
  assert.deepEqual(after.emailLines, await perPartner(after.eventIds), "one email line per partner");
  assert.equal((await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } }))?.status, "CANCELED", "the job keeps its status");
});

test("a file another send takes between the step's read and its link isn't among the files it says it linked", { skip, timeout }, async () => {
  const { taskId, files } = await jobWithFiles("IN_PROGRESS", 3);
  // Held after the step read Zack's unposted files (all three), before it links any.
  const hold = holdAfter("taskAttachment", "findMany");
  try {
    const post = outcome(prisma.$transaction((tx) => postBatchIn(hold.wrap(tx), taskId, zack, files), LONG));
    await reach(hold, post);
    // Meanwhile another send posts the first file on its own, and commits.
    const other = await outcome(prisma.$transaction((tx) => postBatchIn(tx, taskId, zack, [files[0]])));
    assert.equal(other.ok, true, `the other send posts: ${JSON.stringify(other)}`);
    hold.release();
    const out = await post;
    assert.equal(out.ok, true, `the held send posts the rest: ${JSON.stringify(out)}`);
    assert.deepEqual((out as { value: { linked: string[] } }).value.linked, files.slice(1).sort(), "two linked, so its toast counts two");
    const after = await lines(taskId);
    assert.deepEqual(after.events, [{ batch: true }, { batch: true }], "a line for each send");
    // Two sends, so the bundle's order is the commits', not the events' read order: compared sorted.
    const sorted = (ids: (string | undefined)[]) => [...ids].sort();
    assert.deepEqual(after.emailLines.map(sorted), await perPartner(sorted(after.eventIds) as string[]), "one email line per partner for each");
  } finally {
    hold.release();
  }
});
