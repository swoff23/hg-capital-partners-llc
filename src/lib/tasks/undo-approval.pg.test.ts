import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import * as core from "./core";

/**
 * Approve, then its Undo, on a real Postgres through the app's driver
 * (db-client.ts makeClient: node-postgres via @prisma/adapter-pg), which a
 * fake transaction can't show (ADP-1): the approval's email rows found by
 * jsonb containment and locked `ORDER BY "id" FOR UPDATE`, takeBackRepeat's
 * copy and email-row locks and delete, and the Undo's 2-minute limit read
 * from timestamps the adapter returns (on a developer's Postgres the session
 * is local time). Opt-in like job-batch.pg.test.ts, by the same guard: `npm
 * test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch"); it writes rows there and
 * leaves them.
 *
 *   createdb -h localhost hg_undo_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_undo_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_undo_scratch npx tsx --test src/lib/tasks/undo-approval.pg.test.ts
 *   dropdb -h localhost hg_undo_scratch
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole (job-batch.pg.test.ts's rule). */
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
const timeout = 30_000;

let prisma: PrismaClient;
let staff: core.Principal;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  const run = randomUUID().slice(0, 8);
  const connor = await prisma.user.create({ data: { email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" } });
  await prisma.user.create({ data: { email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" } });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  const contact = await prisma.contact.create({ data: { fullName: "Zack Outlaw" } });
  // A login, so the approval and the next copy's "assigned you" are each an email row for Zack.
  await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE" },
  });
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Outlaw" };
  propertyId = (await prisma.property.create({ data: { address: `${run} Sherwood St, Buffalo, NY 14213` } })).id;
});

after(async () => {
  if (!skip) await prisma.$disconnect();
});

/** A weekly job of Zack's that he marked done, then Connor approved: the approval's STATUS line and the copy it made. */
async function approvedJob(): Promise<{ taskId: string; approvedEventId: string; copyId: string }> {
  const task = await prisma.$transaction((tx) =>
    core.createTask(tx, { title: "Change the furnace filter", propertyId, assignee: { contactId: zack.contactId }, repeatRule: { freq: "weeks", interval: 1 } }, staff),
  );
  await prisma.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
  await prisma.$transaction((tx) => core.setStatus(tx, task.id, "REVIEW", zack, { note: "Filter changed." }));
  const approved = await prisma.$transaction((tx) => core.setStatus(tx, task.id, "DONE", staff, { expected: "REVIEW" }));
  assert.ok(approved.nextTaskId, "a weekly job makes its next copy");
  return { taskId: task.id, approvedEventId: approved.statusEventId, copyId: approved.nextTaskId };
}

/** Zack's email rows on this task that name the approval, read as the Undo reads them. */
async function approvalRows(taskId: string, approvedEventId: string) {
  return prisma.$queryRaw<{ id: string; sentAt: Date | null; openKey: string | null; attempts: number }[]>`
    SELECT "id", "sentAt", "openKey", "attempts" FROM "NotificationOutbox"
    WHERE "taskId" = ${taskId} AND "items" @> jsonb_build_array(jsonb_build_object('eventId', ${approvedEventId}::text))
    ORDER BY "id"`;
}

const undo = (taskId: string, approvedEventId: string) => prisma.$transaction((tx) => core.undoApproval(tx, taskId, approvedEventId, staff));

test("Approve then Undo: back in Review, the Done line hidden, the next copy and its email taken back", { skip, timeout }, async () => {
  const { taskId, approvedEventId, copyId } = await approvedJob();
  const rows = await approvalRows(taskId, approvedEventId);
  assert.equal(rows.length, 1, "the approval's email to Zack, found by its event");
  assert.ok(await prisma.notificationOutbox.count({ where: { taskId: copyId } }), "the copy's 'assigned you' row");

  const { task } = await undo(taskId, approvedEventId);
  assert.equal(task.status, "REVIEW");
  assert.equal(task.completedAt, null);
  const line = await prisma.taskEvent.findUnique({ where: { id: approvedEventId }, select: { deletedAt: true } });
  assert.ok(line?.deletedAt, "the Done line is soft-deleted, so the drain drops it from the waiting email");
  assert.equal(await prisma.task.count({ where: { id: copyId } }), 0, "the untouched copy is gone");
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: copyId } }), 0, "with its unsent email");
  assert.equal(await prisma.taskEvent.count({ where: { taskId, kind: "REPEAT_CREATED" } }), 0, "and its REPEAT_CREATED line");
  assert.equal(await prisma.taskEvent.count({ where: { taskId, kind: "STATUS", deletedAt: null, data: { path: ["to"], equals: "DONE" } } }), 0);
  assert.deepEqual(
    (await approvalRows(taskId, approvedEventId)).map((r) => r.sentAt),
    [null],
    "the row stays for the drain, which reads the line back and leaves it out",
  );

  // A retry of an Undo that went through is a quiet success, and changes nothing.
  const again = await undo(taskId, approvedEventId);
  assert.equal(again.task.status, "REVIEW");
});

test("the Undo's 2-minute limit holds on the times the adapter reads back, whatever the session's zone", { skip, timeout }, async () => {
  // Every other case undoes moments after approving, so a misread that made the approval look newer would pass them.
  // The column holds UTC without a zone; read as local time on a New York session it would be hours off either way.
  const { taskId, approvedEventId } = await approvedJob();
  const [{ zone, stored }] = await prisma.$queryRaw<{ zone: string; stored: string }[]>`
    SELECT current_setting('TimeZone') AS zone, to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS stored
    FROM "TaskEvent" WHERE "id" = ${approvedEventId}`;
  const read = await prisma.taskEvent.findUniqueOrThrow({ where: { id: approvedEventId }, select: { createdAt: true } });
  assert.equal(read.createdAt.toISOString(), stored, `the stored UTC instant comes back as itself (session zone ${zone})`);

  // Three minutes old: refused, and nothing changes.
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - interval '3 minutes' WHERE "taskId" = ${taskId} AND "kind" = 'STATUS'`;
  await assert.rejects(undo(taskId, approvedEventId), (e) => e instanceof core.TaskRuleError && e.message === "Too late to undo. Change the status.");
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status, "DONE");
  // One minute old: it goes through.
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" + interval '2 minutes' WHERE "taskId" = ${taskId} AND "kind" = 'STATUS'`;
  assert.equal((await undo(taskId, approvedEventId)).task.status, "REVIEW");
});

test("Undo is refused once the approval's email is claimed or sent, read through the adapter; nothing changes", { skip, timeout }, async () => {
  const { taskId, approvedEventId, copyId } = await approvedJob();
  const [row] = await approvalRows(taskId, approvedEventId);
  // A send run's claim (outbox.ts claim): the open key goes and a try is spent.
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { openKey: null, attempts: 1 } });
  await assert.rejects(undo(taskId, approvedEventId), (e) => e instanceof core.TaskRuleError && e.message === "The email is on its way. Change the status.");
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
  await assert.rejects(undo(taskId, approvedEventId), (e) => e instanceof core.TaskRuleError && e.message === "Email already sent. Change the status.");
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status, "DONE");
  assert.equal(await prisma.task.count({ where: { id: copyId } }), 1, "the copy stays");
  assert.equal((await prisma.taskEvent.findUniqueOrThrow({ where: { id: approvedEventId } })).deletedAt, null);
});

test("Undo holds the approval's email row: a send run's claim waits for it, then finds the line gone", { skip, timeout }, async () => {
  const { taskId, approvedEventId } = await approvedJob();
  const [row] = await approvalRows(taskId, approvedEventId);

  // Stop the Undo just after it locks the approval's email rows (the jsonb containment query), with its backend's pid.
  let reached!: (pid: number) => void;
  let release!: () => void;
  const atHold = new Promise<number>((r) => (reached = r));
  const gate = new Promise<void>((r) => (release = r));
  const held = (tx: core.Tx): core.Tx =>
    new Proxy(tx, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop !== "$queryRaw") return typeof value === "function" ? value.bind(target) : value;
        return async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const out = await target.$queryRaw(sql, ...values);
          if (sql.join("?").includes('"NotificationOutbox"') && sql.join("?").includes("@>")) {
            const [{ pid }] = await target.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            reached(pid);
            await gate;
          }
          return out;
        };
      },
    });
  const undoing = prisma.$transaction((tx) => core.undoApproval(held(tx), taskId, approvedEventId, staff), { maxWait: 10_000, timeout: 20_000 }).then(
    (v) => ({ ok: true as const, status: v.task.status }),
    (e: Error) => ({ ok: false as const, message: e.message }),
  );
  let claiming: Promise<{ attempts: number }[]> | null = null;
  try {
    const first = await Promise.race([atHold, undoing]);
    assert.equal(typeof first, "number", `the Undo ended before its email rows: ${JSON.stringify(first)}`);
    const pid = first as number;
    // The claim's own statement, on another connection. A Prisma query runs once something asks for its answer.
    claiming = prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE "NotificationOutbox" SET "openKey" = NULL, "attempts" = "attempts" + 1
      WHERE "id" = ${row.id} AND "sentAt" IS NULL
      RETURNING "attempts"`.then((r) => r);
    // It waits on the Undo's lock: the FOR UPDATE ran inside the Undo's transaction, on its connection.
    let waiting = false;
    for (let i = 0; i < 400 && !waiting; i++) {
      const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND ${pid}::int = ANY(pg_blocking_pids(pid))`;
      waiting = n > 0;
      if (!waiting) await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(waiting, `the claim never waited on the Undo (backend ${pid})`);
  } finally {
    // Let go however the wait ended, and see the Undo out before the client disconnects.
    release();
    await undoing;
  }
  assert.deepEqual(await undoing, { ok: true, status: "REVIEW" });
  assert.deepEqual(await claiming, [{ attempts: 1 }], "the claim goes through after the Undo commits");
  // What the drain then reads back for the approval's line: deleted, so it's left out of the email.
  assert.ok((await prisma.taskEvent.findUniqueOrThrow({ where: { id: approvedEventId } })).deletedAt);
});

test("closing straight back after a reopen or Approve's Undo gives an archived contractor's job back, in the lines' real order", { skip, timeout }, async () => {
  // Nov 3 low 4's residual, on the adapter: the drop and the reopen are written in one transaction, and the give-back
  // reads them back newest first (createdAt, then id), which a fake can't show. No login: Archive needs it removed.
  const painter = await prisma.contact.create({ data: { fullName: "Rv Painter", trades: "Painting" } });
  const job = (title: string) => prisma.$transaction((tx) => core.createTask(tx, { title, propertyId, assignee: { contactId: painter.id } }, staff));
  const status = (taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, staff, { expected }));
  const reopenCase = await job("Paint the porch");
  const approveCase = await job("Paint the railings");
  await status(reopenCase.id, "DONE", "OPEN");
  await status(approveCase.id, "REVIEW", "OPEN");
  const approved = await status(approveCase.id, "DONE", "REVIEW");
  // Archived since (as Archive would, once both were closed or in Review; set here directly).
  await prisma.contact.update({ where: { id: painter.id }, data: { archivedAt: new Date() } });

  // A reopen starts the job unassigned; its Undo gives it back.
  assert.equal((await status(reopenCase.id, "OPEN", "DONE")).task.assigneeContactId, null);
  const undone = await status(reopenCase.id, "DONE", "OPEN");
  assert.equal(undone.task.assigneeContactId, painter.id);
  assert.equal(undone.emailsContractor, false);
  const access = (taskId: string) => prisma.taskAccess.count({ where: { taskId, contactId: painter.id, source: "ASSIGNEE", revokedAt: null } });
  assert.equal(await access(reopenCase.id), 1, "his access row comes back with it");

  // Approve's Undo puts it back in Review without him; Approve again gives it back.
  assert.equal((await undo(approveCase.id, approved.statusEventId)).task.assigneeContactId, null);
  assert.equal((await status(approveCase.id, "DONE", "REVIEW")).task.assigneeContactId, painter.id);
  assert.equal(await access(approveCase.id), 1);

  // A reopen followed by any other move is new work: closing it later leaves it unassigned.
  await status(reopenCase.id, "OPEN", "DONE");
  await status(reopenCase.id, "IN_PROGRESS", "OPEN");
  assert.equal((await status(reopenCase.id, "DONE", "IN_PROGRESS")).task.assigneeContactId, null);
  assert.equal(await prisma.notificationOutbox.count({ where: { recipientContactId: painter.id } }), 0, "no email ever queued for him");
});
