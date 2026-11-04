import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { todayYmdEastern } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { activeTask } from "@/lib/task-scope";
import { buildActivity } from "./activity";
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
let pieter: core.Principal;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  const run = randomUUID().slice(0, 8);
  const connor = await prisma.user.create({ data: { email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" } });
  const pieterUser = await prisma.user.create({ data: { email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" } });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  pieter = { kind: "staff", userId: pieterUser.id, label: "Pieter" };
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

test("only the reopen's Undo, or Approve again after Approve's Undo, gives an archived contractor's job back, on the lines' real order and times", { skip, timeout }, async () => {
  // Nov 3 low 4's residual as the task session ruled it, on the adapter: the drop and the reopen are written in one
  // transaction, and the give-back reads them back newest first (createdAt, then id) with the reopen's createdAt as the
  // adapter returns it, which a fake can't show. No login: Archive needs it removed.
  const painter = await prisma.contact.create({ data: { fullName: "Rv Painter", trades: "Painting" } });
  const job = (title: string) => prisma.$transaction((tx) => core.createTask(tx, { title, propertyId, assignee: { contactId: painter.id } }, staff));
  const status = (taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, staff, { expected }));
  const backDate = (taskId: string, minutes: number) =>
    prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - make_interval(mins => ${minutes}::int) WHERE "taskId" = ${taskId} AND "kind" IN ('STATUS', 'ASSIGNED')`;
  const givenBackLines = (taskId: string) => prisma.taskEvent.count({ where: { taskId, kind: "ASSIGNED", data: { path: ["givenBack"], equals: true } } });
  const access = (taskId: string) => prisma.taskAccess.count({ where: { taskId, contactId: painter.id, source: "ASSIGNEE", revokedAt: null } });

  const reopenUndo = await job("Paint the porch");
  const reopenLate = await job("Paint the steps");
  const reopenCancel = await job("Paint the door");
  const reopenReview = await job("Paint the trim");
  const reopenCanceled = await job("Paint the gate");
  const reopenCanceledDone = await job("Paint the fence");
  const approveLate = await job("Paint the railings");
  const approveCancel = await job("Paint the shutters");
  for (const t of [reopenUndo, reopenLate, reopenCancel, reopenReview]) await status(t.id, "DONE", "OPEN");
  for (const t of [reopenCanceled, reopenCanceledDone]) await status(t.id, "CANCELED", "OPEN");
  // Canceled last week, so the reopen below isn't read as that Cancel's own reversal.
  for (const t of [reopenCanceled, reopenCanceledDone]) await backDate(t.id, 7 * 24 * 60);
  const approvals = new Map<string, string>();
  for (const t of [approveLate, approveCancel]) {
    await status(t.id, "REVIEW", "OPEN");
    approvals.set(t.id, (await status(t.id, "DONE", "REVIEW")).statusEventId);
  }
  // Archived since (as Archive would, once all were closed; set here directly).
  await prisma.contact.update({ where: { id: painter.id }, data: { archivedAt: new Date() } });

  // A reopen starts the job unassigned; its Undo gives it back, marked, with his access row.
  for (const t of [reopenUndo, reopenLate, reopenCancel]) assert.equal((await status(t.id, "OPEN", "DONE")).task.assigneeContactId, null);
  assert.equal((await status(reopenCanceled.id, "OPEN", "CANCELED")).task.assigneeContactId, null);
  // Each reopen's own line names who it dropped, read back through the adapter.
  for (const t of [reopenUndo, reopenLate, reopenCancel, reopenCanceled]) {
    assert.equal(await prisma.taskEvent.count({ where: { taskId: t.id, kind: "STATUS", data: { path: ["dropped"], equals: painter.id } } }), 1, t.title);
  }
  const undone = await status(reopenUndo.id, "DONE", "OPEN");
  assert.equal(undone.task.assigneeContactId, painter.id);
  assert.equal(undone.emailsContractor, false);
  assert.equal(await givenBackLines(reopenUndo.id), 1);
  assert.equal(await access(reopenUndo.id), 1, "his access row comes back with it");
  // A Done job reopened to Review is his again when approved at once: Approve is its way back to Done.
  assert.equal((await status(reopenReview.id, "REVIEW", "DONE")).task.assigneeContactId, null);
  const approvedAgain = await status(reopenReview.id, "DONE", "REVIEW");
  assert.equal(approvedAgain.task.assigneeContactId, painter.id);
  assert.equal(approvedAgain.emailsContractor, false);
  assert.equal(await givenBackLines(reopenReview.id), 1);
  assert.equal(await access(reopenReview.id), 1, "his access row comes back with it");

  // Past the Undo's window, the same close is new work: it closes unassigned, with no ASSIGNED line.
  await backDate(reopenLate.id, 3);
  const late = await status(reopenLate.id, "DONE", "OPEN");
  assert.equal(late.task.assigneeContactId, null);
  assert.equal(await givenBackLines(reopenLate.id), 0);
  assert.equal(await access(reopenLate.id), 0);
  // So is a different close straight after the reopen.
  assert.equal((await status(reopenCancel.id, "CANCELED", "OPEN")).task.assigneeContactId, null);
  assert.equal(await givenBackLines(reopenCancel.id), 0);
  assert.equal(await access(reopenCancel.id), 0);
  // A Canceled job's way back is Cancel: canceling it again at once is its reopen's Undo, and gives it back.
  const recanceled = await status(reopenCanceled.id, "CANCELED", "OPEN");
  assert.equal(recanceled.task.assigneeContactId, painter.id);
  assert.equal(recanceled.emailsContractor, false);
  assert.equal(await givenBackLines(reopenCanceled.id), 1);
  assert.equal(await access(reopenCanceled.id), 1);
  // And the timeline, read from the rows as written, shows none of the four lines (activity.ts heldPairs).
  const rows = await prisma.taskEvent.findMany({ where: { taskId: reopenCanceled.id } });
  const fresh = rows.filter((e) => e.createdAt.getTime() > Date.now() - 60_000 && (e.kind === "ASSIGNED" || e.kind === "STATUS")).map((e) => e.id);
  assert.equal(fresh.length, 4, "the drop, the reopen, the give-back and the Cancel");
  const timeline = buildActivity(rows, {}, todayYmdEastern());
  assert.deepEqual(
    timeline.flatMap((e) => e.events.map((x) => x.id)).filter((id) => fresh.includes(id)),
    [],
    "as an unassigned Canceled job's reopen and Undo show nothing",
  );
  // Reopened, then Done, it closes unassigned: Done isn't the way back to Canceled.
  assert.equal((await status(reopenCanceledDone.id, "OPEN", "CANCELED")).task.assigneeContactId, null);
  assert.equal((await status(reopenCanceledDone.id, "DONE", "OPEN")).task.assigneeContactId, null);
  assert.equal(await givenBackLines(reopenCanceledDone.id), 0);
  assert.equal(await access(reopenCanceledDone.id), 0);

  // Approve's Undo puts the job back in Review without him; Approve again gives it back, minutes later too.
  for (const t of [approveLate, approveCancel]) assert.equal((await undo(t.id, approvals.get(t.id)!)).task.assigneeContactId, null);
  await backDate(approveLate.id, 3);
  assert.equal((await status(approveLate.id, "DONE", "REVIEW")).task.assigneeContactId, painter.id);
  assert.equal(await givenBackLines(approveLate.id), 1);
  assert.equal(await access(approveLate.id), 1);
  // A Cancel from there closes it unassigned.
  assert.equal((await status(approveCancel.id, "CANCELED", "REVIEW")).task.assigneeContactId, null);
  assert.equal(await givenBackLines(approveCancel.id), 0);
  assert.equal(await access(approveCancel.id), 0);

  // A reopen followed by any other move is new work too: closing it later leaves it unassigned.
  await status(reopenUndo.id, "OPEN", "DONE");
  await status(reopenUndo.id, "IN_PROGRESS", "OPEN");
  assert.equal((await status(reopenUndo.id, "DONE", "IN_PROGRESS")).task.assigneeContactId, null);
  assert.equal(await prisma.notificationOutbox.count({ where: { recipientContactId: painter.id } }), 0, "no email ever queued for him");
});

test("a reopen gives back only the contractor it dropped itself, not a drop Approve's Undo left before a Cancel with no line", { skip, timeout }, async () => {
  // The task session's third review, low 1, on the adapter: Approve, Archive, Approve's Undo (a drop and no status
  // line), then the job Canceled with no line (service.ts cancelOpenAutoTask's write, made here directly: service.ts
  // loads server-only). A reopen of the unassigned job drops nobody and marks nothing, so its Cancel inside the window
  // closes it unassigned.
  const roofer = await prisma.contact.create({ data: { fullName: "Lw Roofer", trades: "Roofing" } });
  const status = (taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, staff, { expected }));
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Patch the roof", propertyId, assignee: { contactId: roofer.id } }, staff));
  await status(task.id, "REVIEW", "OPEN");
  const approved = await status(task.id, "DONE", "REVIEW");
  await prisma.contact.update({ where: { id: roofer.id }, data: { archivedAt: new Date() } });
  assert.equal((await undo(task.id, approved.statusEventId)).task.assigneeContactId, null);
  await prisma.task.update({ where: { id: task.id }, data: { status: "CANCELED", completedAt: new Date() } });

  const reopened = await status(task.id, "OPEN", "CANCELED");
  assert.equal(reopened.task.assigneeContactId, null);
  const line = await prisma.taskEvent.findUniqueOrThrow({ where: { id: reopened.statusEventId }, select: { data: true } });
  assert.deepEqual(line.data, { from: "CANCELED", to: "OPEN" }, "it dropped nobody, so it marks nobody");
  const canceled = await status(task.id, "CANCELED", "OPEN");
  assert.equal(canceled.task.assigneeContactId, null, "closed unassigned");
  assert.equal(await prisma.taskEvent.count({ where: { taskId: task.id, kind: "ASSIGNED", data: { path: ["givenBack"], equals: true } } }), 0);
  assert.equal(await prisma.taskAccess.count({ where: { taskId: task.id, contactId: roofer.id, revokedAt: null } }), 0, "his access row stays revoked");
});

test("Connor's reopen, then Pieter's Cancel and its Undo: open and unassigned, and the timeline shows only Connor's reopen", { skip, timeout }, async () => {
  // Low 2 on the adapter's rows: Pieter's Cancel gave the job back (inside the reopen's window) and his Undo took it
  // off again, so his give-back and his drop go with his paired status lines, whichever came first.
  const tiler = await prisma.contact.create({ data: { fullName: "Lw Tiler", trades: "Tile" } });
  const as = (p: core.Principal, taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, p, { expected }));
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Regrout the shower", propertyId, assignee: { contactId: tiler.id } }, staff));
  await as(staff, task.id, "CANCELED", "OPEN");
  // Canceled last week, so Connor's reopen isn't read as that Cancel's own reversal.
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - interval '7 days' WHERE "taskId" = ${task.id}`;
  await prisma.contact.update({ where: { id: tiler.id }, data: { archivedAt: new Date() } });

  const connorsReopen = await as(staff, task.id, "OPEN", "CANCELED");
  assert.equal(connorsReopen.task.assigneeContactId, null);
  assert.equal((await as(pieter, task.id, "CANCELED", "OPEN")).task.assigneeContactId, tiler.id, "his Cancel gives it back");
  const pietersUndo = await as(pieter, task.id, "OPEN", "CANCELED");
  assert.equal(pietersUndo.task.assigneeContactId, null, "and its Undo takes it off him again");
  for (const id of [connorsReopen.statusEventId, pietersUndo.statusEventId]) {
    const { data } = await prisma.taskEvent.findUniqueOrThrow({ where: { id }, select: { data: true } });
    assert.equal((data as { dropped?: unknown }).dropped, tiler.id, "each reopen names who it dropped");
  }
  assert.equal(await prisma.taskAccess.count({ where: { taskId: task.id, contactId: tiler.id, revokedAt: null } }), 0);

  const rows = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
  const fresh = rows.filter((e) => e.createdAt.getTime() > Date.now() - 60_000 && (e.kind === "ASSIGNED" || e.kind === "STATUS"));
  assert.equal(fresh.length, 6, "two drops, a give-back and three status lines");
  const connors = fresh.filter((e) => e.actorUserId === (staff as { userId: string }).userId).map((e) => e.id);
  assert.equal(connors.length, 2, "his drop and his reopen");
  const shownIds = buildActivity(rows, {}, todayYmdEastern()).flatMap((e) => e.events.map((x) => x.id));
  assert.deepEqual(
    shownIds.filter((id) => fresh.some((e) => e.id === id)).sort(),
    [...connors].sort(),
  );
});

test("a give-back whose approval was undone isn't hidden with the later reopen's drop, on the rows as written", { skip, timeout }, async () => {
  // The verify pass's finding 3 on the adapter, all by one person: Approve, Archive, Approve's Undo (a drop), Approve
  // again (the give-back, written with that approval's line), Restore, that approval's Undo (its line soft-deleted, no
  // drop), Cancel from Review, Archive, and a reopen to Review inside 2 minutes (a marked drop). The Cancel and the
  // reopen pair; the give-back was written with the undone approval, so it and the reopen's drop both stay.
  const glazer = await prisma.contact.create({ data: { fullName: "Vf Glazer", trades: "Glazing" } });
  const status = (taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, staff, { expected }));
  const archive = (archivedAt: Date | null) => prisma.contact.update({ where: { id: glazer.id }, data: { archivedAt } });
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Reglaze the sash", propertyId, assignee: { contactId: glazer.id } }, staff));
  await status(task.id, "REVIEW", "OPEN");
  const first = await status(task.id, "DONE", "REVIEW");
  await archive(new Date());
  assert.equal((await undo(task.id, first.statusEventId)).task.assigneeContactId, null, "Approve's Undo drops him");
  const second = await status(task.id, "DONE", "REVIEW");
  assert.equal(second.task.assigneeContactId, glazer.id, "Approve again gives it back");
  await archive(null);
  assert.equal((await undo(task.id, second.statusEventId)).task.assigneeContactId, glazer.id, "restored, so that Undo drops nobody");
  await status(task.id, "CANCELED", "REVIEW");
  await archive(new Date());
  const reopened = await status(task.id, "REVIEW", "CANCELED");
  assert.equal(reopened.task.assigneeContactId, null);

  const rows = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
  const assigned = rows.filter((e) => e.kind === "ASSIGNED");
  assert.equal(assigned.length, 3, "two drops and the give-back");
  const shownIds = new Set(buildActivity(rows, {}, todayYmdEastern()).flatMap((e) => e.events.map((x) => x.id)));
  for (const e of assigned) assert.ok(shownIds.has(e.id), `${JSON.stringify(e.data)} stays on the timeline`);
});

test("flow B on real rows: three partners' reopens and Cancels end Done and unassigned, and the timeline says so", { skip, timeout }, async () => {
  // The task session's fourth review, finding 1, through the real setStatus: Pieter reopens a Canceled job of an
  // archived contractor's, Connor cancels it (which gives it back), Pieter reopens, Dana cancels (gives it back), and
  // Connor reopens and finishes it, all inside 2 minutes. Connor's Cancel and his reopen have others' moves between
  // them, so they aren't his there and back: every line stands, and the last say Done and unassigned.
  const gutters = await prisma.contact.create({ data: { fullName: "Fb Gutters", trades: "Gutters" } });
  // No sign-in: job-batch.pg.test.ts counts the partners who have one while its emails are written, and may be running
  // alongside on the same database.
  const dana: core.Principal = {
    kind: "staff",
    userId: (await prisma.user.create({ data: { email: `dana-${randomUUID().slice(0, 8)}@example.test`, name: "Dana" } })).id,
    label: "Dana",
  };
  const as = (p: core.Principal, taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, p, { expected }));
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Clear the gutters", propertyId, assignee: { contactId: gutters.id } }, staff));
  await as(staff, task.id, "CANCELED", "OPEN");
  // Canceled last week, so no step below is read as that Cancel's own reversal.
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - interval '7 days' WHERE "taskId" = ${task.id}`;
  await prisma.contact.update({ where: { id: gutters.id }, data: { archivedAt: new Date() } });

  const steps: [core.Principal, Parameters<typeof core.setStatus>[2]][] = [
    [pieter, "IN_PROGRESS"],
    [staff, "CANCELED"],
    [pieter, "OPEN"],
    [dana, "CANCELED"],
    [staff, "IN_PROGRESS"],
    [staff, "DONE"],
  ];
  let at: Parameters<typeof core.setStatus>[2] = "CANCELED";
  for (const [p, to] of steps) {
    await as(p, task.id, to, at);
    at = to;
  }
  const done = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(done.status, "DONE");
  assert.equal(done.assigneeContactId, null, "Connor's reopen took it off him, and nothing gave it back");
  assert.equal(await prisma.taskAccess.count({ where: { taskId: task.id, contactId: gutters.id, revokedAt: null } }), 0, "his access stays revoked");

  const rows = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
  const timeline = buildActivity(rows, { contacts: { [gutters.id]: "Fb Gutters" } }, todayYmdEastern());
  assert.deepEqual(
    timeline.map((e) => ("text" in e ? e.text : e.type)),
    [
      "Connor created this task",
      "Connor set status to Canceled",
      "Unassigned because Fb Gutters is archived",
      "Pieter set status to In progress",
      "Assigned back to Fb Gutters",
      "Connor set status to Canceled",
      "Unassigned because Fb Gutters is archived",
      "Pieter set status to To do",
      "Assigned back to Fb Gutters",
      "Dana set status to Canceled",
      "Unassigned because Fb Gutters is archived",
      "Connor changed the status 2 times, now Done",
    ],
  );
});

test("a reopen, then a Cancel that wrote no line, then Done inside 2 minutes: not the reopen's Undo, so it closes unassigned", { skip, timeout }, async () => {
  // Finding 2: an auto task (a property reminder) held by a contractor is Done, and he is archived. A reopen drops him
  // and marks its line. Clearing the property's key date then cancels the job with service.ts cancelOpenAutoTask's
  // updateMany, which writes no line (service.ts loads server-only, so its statement runs here as written there). The
  // reopen is still the latest line, the toast's Undo is refused, and a close from Canceled starts where no reopen
  // left the job: it closes unassigned, with his access still revoked.
  const insurer = await prisma.contact.create({ data: { fullName: "Fa Insurer", trades: "Insurance" } });
  const reminder: core.Principal = { kind: "system", label: "Property reminder" };
  const status = (taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, staff, { expected }));
  for (const open of ["OPEN", "REVIEW"] as const) {
    const autoKey = `${propertyId}:insurance-${randomUUID().slice(0, 8)}`;
    const task: { id: string } = await prisma.$transaction((tx) =>
      core.createTask(tx, { title: `Renew the insurance (${open})`, propertyId, autoKey, assignee: { contactId: insurer.id } }, reminder),
    );
    await status(task.id, "DONE", "OPEN");
    await prisma.contact.update({ where: { id: insurer.id }, data: { archivedAt: new Date() } });

    const reopened = await status(task.id, open, "DONE");
    assert.equal(reopened.task.assigneeContactId, null);
    const line = await prisma.taskEvent.findUniqueOrThrow({ where: { id: reopened.statusEventId }, select: { data: true } });
    assert.equal((line.data as { dropped?: unknown }).dropped, insurer.id, "the reopen marks its drop");
    // cancelOpenAutoTask (service.ts), as written there.
    const canceled = await prisma.task.updateMany({ where: { autoKey, ...activeTask }, data: { status: "CANCELED", autoKey: null, completedAt: new Date() } });
    assert.equal(canceled.count, 1);
    await assert.rejects(status(task.id, "DONE", open), (e) => e instanceof core.TaskChangedError, `${open}: the toast's Undo is refused`);

    const closed = await status(task.id, "DONE", "CANCELED");
    assert.equal(closed.task.status, "DONE");
    assert.equal(closed.task.assigneeContactId, null, `${open}: not the reopen's Undo`);
    assert.equal(closed.emailsContractor, false);
    assert.equal(await prisma.taskEvent.count({ where: { taskId: task.id, kind: "ASSIGNED", data: { path: ["givenBack"], equals: true } } }), 0, open);
    assert.equal(await prisma.taskAccess.count({ where: { taskId: task.id, contactId: insurer.id, revokedAt: null } }), 0, `${open}: his access stays revoked`);
    await prisma.contact.update({ where: { id: insurer.id }, data: { archivedAt: null } });
  }
  assert.equal(await prisma.notificationOutbox.count({ where: { recipientContactId: insurer.id } }), 0, "no email ever queued for him");
});

test("G1 on real rows: someone's pick between a give-back and the drop after it leaves the job open and nobody's, and the timeline ends on why", { skip, timeout }, async () => {
  // The verify pass on the fourth review, finding 1, through the real setStatus and patchTask. Zack's Canceled job, Zack
  // archived: Connor reopens it (a drop), Pieter cancels it (the give-back), Connor reassigns it to another contractor,
  // Dana's picker (loaded before the archive) gives it to Zack again, and Pieter reopens it inside 2 minutes of his
  // Cancel (a drop). Pieter's Cancel and reopen pair, but the give-back and that drop are no there-and-back.
  const caulker = await prisma.contact.create({ data: { fullName: "Gp Caulker", trades: "Caulking" } });
  const mason = await prisma.contact.create({ data: { fullName: "Gp Mason", trades: "Masonry" } });
  const dana: core.Principal = {
    kind: "staff",
    userId: (await prisma.user.create({ data: { email: `dana-${randomUUID().slice(0, 8)}@example.test`, name: "Dana" } })).id,
    label: "Dana",
  };
  const as = (p: core.Principal, taskId: string, to: Parameters<typeof core.setStatus>[2], expected: Parameters<typeof core.setStatus>[2]) =>
    prisma.$transaction((tx) => core.setStatus(tx, taskId, to, p, { expected }));
  const pick = (p: core.Principal, taskId: string, to: string, from: string) =>
    prisma.$transaction((tx) => core.patchTask(tx, taskId, { assignee: { contactId: to }, expectedAssignee: { contactId: from } }, p));
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Caulk the tub", propertyId, assignee: { contactId: caulker.id } }, staff));
  await as(staff, task.id, "CANCELED", "OPEN");
  // Canceled last week, so no step below is read as that Cancel's own reversal.
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - interval '7 days' WHERE "taskId" = ${task.id}`;
  await prisma.contact.update({ where: { id: caulker.id }, data: { archivedAt: new Date() } });

  assert.equal((await as(staff, task.id, "OPEN", "CANCELED")).task.assigneeContactId, null);
  assert.equal((await as(pieter, task.id, "CANCELED", "OPEN")).task.assigneeContactId, caulker.id, "his Cancel gives it back");
  assert.equal((await pick(staff, task.id, mason.id, caulker.id)).assigneeContactId, mason.id);
  assert.equal((await pick(dana, task.id, caulker.id, mason.id)).assigneeContactId, caulker.id, "a closed job can go back to him");
  const last = await as(pieter, task.id, "OPEN", "CANCELED");
  assert.equal(last.task.status, "OPEN");
  assert.equal(last.task.assigneeContactId, null, "the reopen took it off him again");
  assert.equal(await prisma.taskAccess.count({ where: { taskId: task.id, contactId: caulker.id, revokedAt: null } }), 0);

  const rows = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
  const timeline = buildActivity(rows, { contacts: { [caulker.id]: "Gp Caulker", [mason.id]: "Gp Mason" } }, todayYmdEastern());
  assert.deepEqual(
    timeline.slice(-4).map((e) => ("text" in e ? e.text : e.type)),
    ["Assigned back to Gp Caulker", "Connor assigned Gp Mason", "Dana assigned Gp Caulker", "Unassigned because Gp Caulker is archived"],
  );
});

test("G2 on real rows: a pick and its reversal don't pair across a drop and a give-back between them; the job ends canceled and nobody's", { skip, timeout }, async () => {
  // The verify pass's finding 2, through the real setStatus and patchTask. A Canceled job nobody holds; a contractor who
  // has been archived since a page loaded is picked for it, Pieter reopens it (a drop), Connor cancels it (the give-back),
  // and Pieter unassigns it, all inside 2 minutes. The drop and the give-back moved the job between his pick and his
  // unassign, so those two are no there-and-back, and the timeline ends on the unassign.
  const tiler = await prisma.contact.create({ data: { fullName: "Gq Tiler", trades: "Tile" } });
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title: "Seal the grout", propertyId }, staff));
  await prisma.$transaction((tx) => core.setStatus(tx, task.id, "CANCELED", staff, { expected: "OPEN" }));
  await prisma.$executeRaw`UPDATE "TaskEvent" SET "createdAt" = "createdAt" - interval '7 days' WHERE "taskId" = ${task.id}`;
  await prisma.contact.update({ where: { id: tiler.id }, data: { archivedAt: new Date() } });

  const picked = await prisma.$transaction((tx) => core.patchTask(tx, task.id, { assignee: { contactId: tiler.id }, expectedAssignee: null }, pieter));
  assert.equal(picked.assigneeContactId, tiler.id, "a closed job can be picked for him");
  assert.equal((await prisma.$transaction((tx) => core.setStatus(tx, task.id, "REVIEW", pieter, { expected: "CANCELED" }))).task.assigneeContactId, null, "the reopen drops him");
  const canceled = await prisma.$transaction((tx) => core.setStatus(tx, task.id, "CANCELED", staff, { expected: "REVIEW" }));
  assert.equal(canceled.task.assigneeContactId, tiler.id, "Connor's Cancel is the reopen's Undo: the give-back");
  const unassigned = await prisma.$transaction((tx) => core.patchTask(tx, task.id, { assignee: null, expectedAssignee: { contactId: tiler.id } }, pieter));
  assert.equal(unassigned.assigneeContactId, null);
  assert.equal(unassigned.status, "CANCELED");

  const rows = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
  const timeline = buildActivity(rows, { contacts: { [tiler.id]: "Gq Tiler" } }, todayYmdEastern());
  const texts = timeline.map((e) => ("text" in e ? e.text : e.type));
  assert.equal(texts.at(-1), "Pieter unassigned this", JSON.stringify(texts));
  assert.ok(texts.includes("Assigned back to Gq Tiler"), JSON.stringify(texts));
});
