import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { jobKey, offItems, parseItems } from "@/lib/notifications/content";
import { toYmd } from "@/lib/dates";
import { assignEach, moveDatesEach, setPropertyEach, setStatusEach, undoAssignEach, undoDatesEach, undoPropertyEach, undoStatusEach } from "./bulk-core";
import * as core from "./core";
import { scheduledDay } from "./rules";

/**
 * Bulk edit's rules (bulk-core.ts, docs/specs/bulk-edit.md) on a real Postgres
 * through the app's driver: each task in its own savepoint, a stale row
 * skipped while the rest change, approvals and repeat copies as one at a time,
 * and each Undo. Opt-in like undo-approval.pg.test.ts, by the same guard:
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch"); it writes rows there and deletes
 * them when it finishes (scratch-rows.ts).
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_bulk_scratch npx tsx --test src/lib/tasks/bulk.pg.test.ts
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
const timeout = 60_000;

let prisma: PrismaClient;
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). */
const made = scratchRows(() => prisma);
let staff: core.Principal;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let joseId: string;
let crescent: string;
let congress: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  const run = randomUUID().slice(0, 8);
  const connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  const contact = await made.contact({ fullName: "Zack Outlaw" });
  // Signed in once with a login, so HG's changes email him (src/lib/portal/job-emails.ts).
  await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() },
  });
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Outlaw" };
  joseId = (await made.contact({ fullName: "Jose Aponte" })).id;
  // Jose signs in too, so taking a job off him and giving it back queues his lines (the Undo email case).
  await prisma.portalAccount.create({
    data: { contactId: joseId, email: `jose-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() },
  });
  crescent = (await made.property({ address: `${run} Crescent Ave, Buffalo, NY 14214`, units: [{ label: "Unit 3" }, { label: "Rear" }] })).id;
  congress = (await made.property({ address: `${run} Congress St, Buffalo, NY 14213`, units: [{ label: "Rear" }, { label: "Front" }] })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

const make = (input: core.NewTaskInput) => prisma.$transaction((tx) => core.createTask(tx, input, staff));
const statusOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

test("a status for many: the stale row is skipped, the rest change, a Review job is approved, and Undo puts each back", { skip, timeout }, async () => {
  const open = await make({ title: "Mud drywall", propertyId: crescent, repeatRule: { freq: "weeks", interval: 1 } });
  const job = await make({ title: "finish electric", propertyId: crescent, assignee: { contactId: zack.contactId } });
  await prisma.task.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } });
  await prisma.$transaction((tx) => core.setStatus(tx, job.id, "REVIEW", zack, { note: "Done." }));
  const stale = await make({ title: "Move water box lower" });
  // The list showed To do; the other partner started it since.
  await prisma.$transaction((tx) => core.setStatus(tx, stale.id, "IN_PROGRESS", staff));

  const out = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: open.id, expected: "OPEN" }, { id: job.id, expected: "REVIEW" }, { id: stale.id, expected: "OPEN" }], "DONE", {}, staff),
  );
  assert.equal(out.done, 2);
  assert.deepEqual(out.skipped, { changed: 1 });
  assert.equal(await statusOf(open.id), "DONE");
  assert.equal(await statusOf(job.id), "DONE");
  assert.equal(await statusOf(stale.id), "IN_PROGRESS", "the skipped task rolled back alone");
  const approval = out.changed.find((c) => c.id === job.id);
  assert.ok(approval?.approvedEventId, "Review to Done is an approval, with its Done line for Undo");
  // This run's copy: the same series as the task it was made from (the scratch database keeps earlier runs' rows).
  const { repeatSeriesId } = await prisma.task.findUniqueOrThrow({ where: { id: open.id }, select: { repeatSeriesId: true } });
  const copy = repeatSeriesId ? await prisma.task.findFirst({ where: { repeatSeriesId, id: { not: open.id } }, select: { id: true } }) : null;
  assert.ok(copy, "the weekly task made its next copy");

  const back = await prisma.$transaction((tx) => undoStatusEach(tx, out.changed, staff));
  assert.equal(back.done, 2);
  assert.equal(await statusOf(open.id), "OPEN");
  assert.equal(await statusOf(job.id), "REVIEW", "back as Approve's Undo takes it");
  assert.equal(await prisma.task.count({ where: { id: copy.id } }), 0, "the untouched copy is taken back");
});

test("Waiting takes one reason for all; one already Waiting takes the new reason, and Undo restores both", { skip, timeout }, async () => {
  const a = await make({ title: "Reinstall thermostat" });
  const b = await make({ title: "Order laundry", status: "WAITING", waitingOn: "the tenant" });
  const out = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: a.id, expected: "OPEN" }, { id: b.id, expected: "WAITING" }], "WAITING", { waitingOn: "National Fuel" }, staff),
  );
  assert.equal(out.done, 2);
  assert.equal(out.changed.length, 2);
  const rows = await prisma.task.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, status: true, waitingOn: true } });
  for (const r of rows) assert.deepEqual([r.status, r.waitingOn], ["WAITING", "National Fuel"]);

  await prisma.$transaction((tx) => undoStatusEach(tx, out.changed, staff));
  const after = new Map((await prisma.task.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, status: true, waitingOn: true } })).map((r) => [r.id, r]));
  assert.deepEqual([after.get(a.id)?.status, after.get(a.id)?.waitingOn], ["OPEN", null]);
  assert.deepEqual([after.get(b.id)?.status, after.get(b.id)?.waitingOn], ["WAITING", "the tenant"]);
});

test("a status Undo leaves a task someone moved since", { skip, timeout }, async () => {
  const a = await make({ title: "bathroom tile work" });
  const out = await prisma.$transaction((tx) => setStatusEach(tx, [{ id: a.id, expected: "OPEN" }], "IN_PROGRESS", {}, staff));
  await prisma.$transaction((tx) => core.setStatus(tx, a.id, "WAITING", staff, { waitingOn: "parts" }));
  const back = await prisma.$transaction((tx) => undoStatusEach(tx, out.changed, staff));
  assert.deepEqual([back.done, back.skipped], [0, { changed: 1 }]);
  assert.equal(await statusOf(a.id), "WAITING");
});

test("assign many: Zack gets the jobs, a stale row is skipped, emails are counted, and Undo gives each back", { skip, timeout }, async () => {
  // Made first, so it's first in id order: the tasks after a skipped one still change.
  const stale = await make({ title: "Unit 3 issues", assignee: { contactId: joseId } });
  const mine = await make({ title: "key for laundry room", assignee: { contactId: joseId } });
  const free = await make({ title: "rear unit door handle" });
  // The list showed Jose; it was reassigned to nobody since.
  await prisma.$transaction((tx) => core.patchTask(tx, stale.id, { assignee: null }, staff));

  const picks = [
    { id: mine.id, expected: { contactId: joseId } },
    { id: free.id, expected: null },
    { id: stale.id, expected: { contactId: joseId } },
  ];
  const out = await prisma.$transaction((tx) => assignEach(tx, picks, { contactId: zack.contactId }, staff));
  assert.equal(out.done, 2);
  assert.deepEqual(out.skipped, { changed: 1 });
  assert.equal(out.emails, 2, "Zack can sign in and has job emails on: one per job");
  assert.equal(await prisma.notificationOutbox.count({ where: { recipientContactId: zack.contactId, taskId: { in: [mine.id, free.id] } } }), 2);
  const stillFree = await prisma.task.findUniqueOrThrow({ where: { id: stale.id }, select: { assigneeContactId: true } });
  assert.equal(stillFree.assigneeContactId, null);

  const back = await prisma.$transaction((tx) => undoAssignEach(tx, out.changed, staff));
  assert.equal(back.done, 2);
  const rows = new Map((await prisma.task.findMany({ where: { id: { in: [mine.id, free.id] } }, select: { id: true, assigneeContactId: true } })).map((r) => [r.id, r]));
  assert.equal(rows.get(mine.id)?.assigneeContactId, joseId);
  assert.equal(rows.get(free.id)?.assigneeContactId, null);
});

test("move many to a building: units kept where it has them, cleared where not, and Undo puts both back", { skip, timeout }, async () => {
  const rear = await make({ title: "SCHEDULE HVAC", propertyId: crescent, unitLabel: "Rear" });
  const unit3 = await make({ title: "Unit 3 issues", propertyId: crescent, unitLabel: "Unit 3" });
  const out = await prisma.$transaction((tx) => setPropertyEach(tx, [rear.id, unit3.id], congress, staff));
  assert.equal(out.done, 2);
  const rows = new Map((await prisma.task.findMany({ where: { id: { in: [rear.id, unit3.id] } }, select: { id: true, propertyId: true, unitLabel: true } })).map((r) => [r.id, r]));
  assert.deepEqual([rows.get(rear.id)?.propertyId, rows.get(rear.id)?.unitLabel], [congress, "Rear"]);
  assert.deepEqual([rows.get(unit3.id)?.propertyId, rows.get(unit3.id)?.unitLabel], [congress, null]);

  await prisma.$transaction((tx) => undoPropertyEach(tx, out.changed, staff));
  const back = new Map((await prisma.task.findMany({ where: { id: { in: [rear.id, unit3.id] } }, select: { id: true, propertyId: true, unitLabel: true } })).map((r) => [r.id, r]));
  assert.deepEqual([back.get(rear.id)?.propertyId, back.get(rear.id)?.unitLabel], [crescent, "Rear"]);
  assert.deepEqual([back.get(unit3.id)?.propertyId, back.get(unit3.id)?.unitLabel], [crescent, "Unit 3"]);
});

test("a task deleted since the list loaded counts as gone", { skip, timeout }, async () => {
  const a = await make({ title: "Gone soon" });
  await prisma.task.delete({ where: { id: a.id } });
  const out = await prisma.$transaction((tx) => setStatusEach(tx, [{ id: a.id, expected: "OPEN" }], "DONE", {}, staff));
  assert.deepEqual([out.done, out.skipped], [0, { gone: 1 }]);
});

test("a status change skips a task someone moved to that status since, and their reason stands", { skip, timeout }, async () => {
  const a = await make({ title: "Reinstall thermostat" });
  const b = await make({ title: "Order laundry" });
  // The list showed To do for both; the other partner set b to Waiting on the tenant since.
  await prisma.$transaction((tx) => core.setStatus(tx, b.id, "WAITING", staff, { waitingOn: "the tenant" }));
  const out = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: a.id, expected: "OPEN" }, { id: b.id, expected: "OPEN" }], "WAITING", { waitingOn: "National Fuel" }, staff),
  );
  assert.deepEqual([out.done, out.skipped], [1, { changed: 1 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: b.id } })).waitingOn, "the tenant");
});

test("a status Undo leaves a reason or visit date someone changed since", { skip, timeout }, async () => {
  const waiting = await make({ title: "Gas shutoff", status: "WAITING", waitingOn: "the tenant" });
  const open = await make({ title: "HVAC visit" });
  const out = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: waiting.id, expected: "WAITING" }], "WAITING", { waitingOn: "National Fuel" }, staff),
  );
  const booked = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: open.id, expected: "OPEN" }], "SCHEDULED", { scheduledFor: "2026-12-01" }, staff),
  );
  // Since: the reason was changed, and the visit moved.
  await prisma.$transaction((tx) => core.patchTask(tx, waiting.id, { waitingOn: "parts" }, staff));
  await prisma.$transaction((tx) => core.patchTask(tx, open.id, { scheduledFor: "2026-12-03" }, staff));
  const back = await prisma.$transaction((tx) => undoStatusEach(tx, [...out.changed, ...booked.changed], staff));
  assert.deepEqual([back.done, back.skipped], [0, { changed: 2 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: waiting.id } })).waitingOn, "parts");
  const job = await prisma.task.findUniqueOrThrow({ where: { id: open.id } });
  assert.deepEqual([job.status, toYmd(job.scheduledFor)], ["SCHEDULED", "2026-12-03"]);
});

test("Scheduled takes one visit date for all, and Undo puts each back as it was", { skip, timeout }, async () => {
  const a = await make({ title: "Smoke detectors" });
  const b = await make({ title: "Rear stairs" });
  const out = await prisma.$transaction((tx) =>
    setStatusEach(tx, [{ id: a.id, expected: "OPEN" }, { id: b.id, expected: "OPEN" }], "SCHEDULED", { scheduledFor: "2026-12-02" }, staff),
  );
  assert.equal(out.done, 2);
  for (const id of [a.id, b.id]) {
    const t = await prisma.task.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([t.status, toYmd(t.scheduledFor)], ["SCHEDULED", "2026-12-02"]);
  }
  await prisma.$transaction((tx) => undoStatusEach(tx, out.changed, staff));
  for (const id of [a.id, b.id]) {
    const t = await prisma.task.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([t.status, t.scheduledFor], ["OPEN", null]);
  }
});

test("assigning a task with an imported name, then Undo, puts the name back", { skip, timeout }, async () => {
  const named = await make({ title: "Basement cleanout", assigneeName: "Mike (Asana)" });
  const out = await prisma.$transaction((tx) => assignEach(tx, [{ id: named.id, expected: null }], { contactId: zack.contactId }, staff));
  assert.equal(out.changed.length, 1, "it has an Undo");
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: named.id } })).assigneeName, null);
  await prisma.$transaction((tx) => undoAssignEach(tx, out.changed, staff));
  const back = await prisma.task.findUniqueOrThrow({ where: { id: named.id } });
  assert.deepEqual([back.assigneeContactId, back.assigneeUserId, back.assigneeName], [null, null, "Mike (Asana)"]);
});

test("moving tasks to the building they're on changes nothing, an unlisted unit included", { skip, timeout }, async () => {
  // "Upper" isn't one of the building's units (it lost it since): the task keeps it, as its own page would.
  const upper = await make({ title: "Upper unit heat", propertyId: congress, unitLabel: "Upper" });
  const elsewhere = await make({ title: "Gutters", propertyId: crescent });
  const out = await prisma.$transaction((tx) => setPropertyEach(tx, [upper.id, elsewhere.id], congress, staff));
  assert.equal(out.done, 2);
  assert.deepEqual(out.changed.map((c) => c.id), [elsewhere.id], "only the one that moved can be undone");
  const kept = await prisma.task.findUniqueOrThrow({ where: { id: upper.id } });
  assert.deepEqual([kept.propertyId, kept.unitLabel], [congress, "Upper"]);
  assert.equal(await prisma.taskEvent.count({ where: { taskId: upper.id, kind: "PROPERTY" } }), 0, "no line for it");
});

test("a date for many: closed and deleted are skipped; jobs move their due date, never their scheduled day", { skip, timeout }, async () => {
  const staffTask = await make({ title: "Order mulch", dueDate: "2026-11-25" });
  const done = await make({ title: "Done already", status: "DONE" });
  const scheduled = await make({ title: "Furnace check", dueDate: "2026-11-27", assignee: { contactId: zack.contactId } });
  await prisma.$transaction((tx) => core.setStatus(tx, scheduled.id, "SCHEDULED", staff, { scheduledFor: "2026-11-26" }));
  const gone = await make({ title: "Gone soon" });
  await prisma.task.delete({ where: { id: gone.id } });
  const ids = [staffTask.id, done.id, scheduled.id, gone.id];

  const moved = await prisma.$transaction((tx) => moveDatesEach(tx, ids, "2026-11-30", staff));
  assert.deepEqual([moved.done, moved.skipped], [2, { gone: 1, closed: 1 }]);
  assert.equal(toYmd((await prisma.task.findUniqueOrThrow({ where: { id: staffTask.id } })).dueDate), "2026-11-30");
  const job = await prisma.task.findUniqueOrThrow({ where: { id: scheduled.id } });
  assert.equal(toYmd(job.dueDate), "2026-11-30", "a Scheduled job moves its due date");
  assert.equal(toYmd(job.scheduledFor), "2026-11-26", "and keeps the contractor's day");
  assert.deepEqual(moved.changed.map((c) => [c.id, c.field, c.value]).sort(), [[staffTask.id, "dueDate", "2026-11-25"], [scheduled.id, "dueDate", "2026-11-27"]].sort());
});

test("reopening a finished repeating task takes back its untouched copy, with the copy locked in order", { skip, timeout }, async () => {
  const weekly = await make({ title: "Trash cans out", repeatRule: { freq: "weeks", interval: 1 } });
  const finished = await prisma.$transaction((tx) => setStatusEach(tx, [{ id: weekly.id, expected: "OPEN" }], "DONE", {}, staff));
  const { repeatSeriesId } = await prisma.task.findUniqueOrThrow({ where: { id: weekly.id }, select: { repeatSeriesId: true } });
  const copy = await prisma.task.findFirstOrThrow({ where: { repeatSeriesId, id: { not: weekly.id } }, select: { id: true } });
  const reopened = await prisma.$transaction((tx) => setStatusEach(tx, [{ id: weekly.id, expected: "DONE" }], "OPEN", {}, staff));
  assert.equal(reopened.done, 1);
  assert.equal(await prisma.task.count({ where: { id: copy.id } }), 0, "the copy went back");
  assert.equal(finished.changed.length, 1);
});

test("Undo of a reassignment queues nothing that will send: the new contractor's lines and the old one's both drop", { skip, timeout }, async () => {
  const job = await make({ title: "Porch light", assignee: { contactId: joseId } });
  // Jose's "assigned you" from making it: say it went, so the bundle under test starts empty.
  await prisma.notificationOutbox.updateMany({ where: { taskId: job.id }, data: { sentAt: new Date(), openKey: null } });
  const out = await prisma.$transaction((tx) => assignEach(tx, [{ id: job.id, expected: { contactId: joseId } }], { contactId: zack.contactId }, staff));
  await prisma.$transaction((tx) => undoAssignEach(tx, out.changed, staff));

  const open = (contactId: string) =>
    prisma.notificationOutbox.findMany({ where: { taskId: job.id, recipientContactId: contactId, sentAt: null }, select: { items: true } });
  const now = await prisma.task.findUniqueOrThrow({ where: { id: job.id } });
  const key = jobKey({ status: now.status, due: toYmd(now.dueDate), scheduled: toYmd(scheduledDay(now)), notes: now.description });
  // Zack's access ended with the Undo; Jose has his back.
  for (const row of await open(zack.contactId)) assert.deepEqual(offItems(parseItems(row.items), { hasAccess: false, canceled: false, job: key }), []);
  const jose = await open(joseId);
  assert.ok(jose.length > 0, "Jose's lines were queued");
  for (const row of jose) assert.deepEqual(offItems(parseItems(row.items), { hasAccess: true, canceled: false, job: key }), []);
});

test("a date Undo puts each back, but leaves a date someone changed since", { skip, timeout }, async () => {
  const a = await make({ title: "Paint trim", dueDate: "2026-11-24" });
  const b = await make({ title: "Caulk tub", dueDate: "2026-11-25" });
  const moved = await prisma.$transaction((tx) => moveDatesEach(tx, [a.id, b.id], "2026-12-01", staff));
  assert.equal(moved.changed.length, 2);
  await prisma.$transaction((tx) => core.patchTask(tx, b.id, { dueDate: "2026-12-05" }, staff));
  const back = await prisma.$transaction((tx) => undoDatesEach(tx, moved.changed, staff));
  assert.deepEqual([back.done, back.skipped], [1, { changed: 1 }]);
  assert.equal(toYmd((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).dueDate), "2026-11-24");
  assert.equal(toYmd((await prisma.task.findUniqueOrThrow({ where: { id: b.id } })).dueDate), "2026-12-05", "their date stands");
});

test("an assign Undo leaves a task someone unassigned since, its imported name not put back", { skip, timeout }, async () => {
  const named = await make({ title: "Attic insulation", assigneeName: "Rob (Asana)" });
  const out = await prisma.$transaction((tx) => assignEach(tx, [{ id: named.id, expected: null }], { contactId: zack.contactId }, staff));
  await prisma.$transaction((tx) => core.patchTask(tx, named.id, { assignee: null }, staff));
  const back = await prisma.$transaction((tx) => undoAssignEach(tx, out.changed, staff));
  assert.deepEqual([back.done, back.skipped], [0, { changed: 1 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: named.id } })).assigneeName, null);
});

test("timing: a status change on 400 tasks", { skip, timeout: 300_000 }, async () => {
  const ids: string[] = [];
  for (let i = 0; i < 400; i++) ids.push((await make({ title: `Bulk timing ${i}`, propertyId: crescent })).id);
  const started = Date.now();
  const out = await prisma.$transaction((tx) => setStatusEach(tx, ids.map((id) => ({ id, expected: "OPEN" as const })), "DONE", {}, staff), { timeout: 120_000 });
  const ms = Date.now() - started;
  console.log(`400 tasks to Done in ${ms} ms`);
  assert.equal(out.done, 400);
});
