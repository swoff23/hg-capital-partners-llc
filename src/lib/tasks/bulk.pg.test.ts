import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { claimedRowVerdict, dueRowVerdict, jobKey, offItems, parseItems, type OutboxItem } from "@/lib/notifications/content";
import { toYmd, todayYmdEastern } from "@/lib/dates";
import { STATUS_ORDER } from "@/lib/task-scope";
import { assignEach, deleteEach, moveDatesEach, setPropertyEach, setStatusEach, undoAssignEach, undoDatesEach, undoPropertyEach, undoStatusEach } from "./bulk-core";
import * as core from "./core";
import { scheduledDay } from "./rules";

/**
 * Bulk edit's rules (bulk-core.ts, docs/specs/bulk-edit.md) on a real Postgres
 * through the app's driver: each task in its own savepoint, a stale row
 * skipped while the rest change, approvals and repeat copies as one at a time,
 * and each Undo. And that none of it touches a draft from Claude
 * (docs/specs/tasks-from-claude.md 6.2) whose id is sent with real tasks'
 * ids: not a change, not an Undo, not Delete. Opt-in like
 * undo-approval.pg.test.ts, by the same guard:
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

// ---------------------------------------------------------------------------
// Drafts from Claude: no bulk edit touches one, whatever ids arrive
// ---------------------------------------------------------------------------

/** A draft as a partner's Claude saves it: Zack's, due, at Crescent's rear unit, with notes and a checklist. */
const saveDraft = (over: Partial<core.NewTaskInput> = {}) =>
  make({
    title: "Fix gutters pulling off the back",
    description: "Bring the tall ladder.",
    dueDate: "2026-11-25",
    propertyId: crescent,
    unitLabel: "Rear",
    assignee: { contactId: zack.contactId },
    checklist: [{ title: "Rehang the downspout" }, { title: "Seal the corner" }],
    draft: { batchKey: randomUUID(), index: 0 },
    ...over,
  });

/**
 * A task and everything that hangs off it, as the database holds it: its row (status, dates, place, person, the
 * edit stamps), its timeline, checklist, files, who can open it and every email row. "Untouched" is this, unchanged.
 */
async function whole(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      events: { orderBy: { id: "asc" } },
      checklist: { orderBy: { id: "asc" } },
      attachments: { orderBy: { id: "asc" } },
      access: { orderBy: { id: "asc" } },
      notifications: { orderBy: { id: "asc" } },
    },
  });
  return JSON.parse(JSON.stringify(task)) as Record<string, unknown> | null;
}

test("a draft sent with real tasks' ids is untouched by a bulk status, assignee, property or date change and by each one's Undo", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const before = await whole(draft.id);
  assert.equal(before?.status, "DRAFT");
  assert.deepEqual([(before?.access as unknown[]).length, (before?.notifications as unknown[]).length], [0, 0], "a draft shows the job to no one and emails no one");
  const untouched = async (what: string) => assert.deepEqual(await whole(draft.id), before, `${what}: the draft is exactly as it was`);
  // Made after the draft, so the draft is first in id order: the tasks after a skipped draft still change.
  const a = await make({ title: "Mud drywall", propertyId: crescent, unitLabel: "Rear", dueDate: "2026-11-24" });
  const b = await make({ title: "finish electric", assignee: { contactId: joseId } });
  const inTx = <T>(fn: (tx: core.Tx) => Promise<T>) => prisma.$transaction(fn);

  // ---- Status: each status the menu offers, with the draft's own status as what its row "showed" ----
  const status = await inTx((tx) =>
    setStatusEach(tx, [{ id: draft.id, expected: "DRAFT" }, { id: a.id, expected: "OPEN" }, { id: b.id, expected: "OPEN" }], "IN_PROGRESS", {}, staff),
  );
  assert.deepEqual([status.done, status.skipped], [2, { changed: 1 }]);
  assert.deepEqual(status.changed.map((c) => c.id).sort(), [a.id, b.id].sort(), "only the tasks have an Undo");
  assert.deepEqual([await statusOf(a.id), await statusOf(b.id)], ["IN_PROGRESS", "IN_PROGRESS"]);
  await untouched("a status for many");
  for (const to of STATUS_ORDER) {
    const out = await inTx((tx) => setStatusEach(tx, [{ id: draft.id, expected: "DRAFT" }], to, { waitingOn: "the city", scheduledFor: "2026-12-01" }, staff));
    assert.deepEqual([out.done, out.changed, out.skipped], [0, [], { changed: 1 }], to);
  }
  await untouched("every status, sent to the draft alone");
  // And no bulk status makes a task a draft: the draft is skipped, the task refused by the rule every status change runs.
  const toDraft = await inTx((tx) => setStatusEach(tx, [{ id: draft.id, expected: "DRAFT" }, { id: a.id, expected: "IN_PROGRESS" }], "DRAFT", {}, staff));
  assert.deepEqual([toDraft.done, toDraft.skipped, toDraft.refusal], [0, { changed: 1, refused: 1 }, "That status change isn't allowed."]);
  assert.equal(await statusOf(a.id), "IN_PROGRESS");

  // Its Undo, with lines for the draft no list ever made: "back to To do", and "its visit date back" (a patch, no status rule in the way).
  const backStatus = await inTx((tx) =>
    undoStatusEach(
      tx,
      [...status.changed, { id: draft.id, from: "OPEN", to: "DRAFT", waitingOn: null, scheduledFor: null, setWaitingOn: null, setScheduledFor: null, approvedEventId: null }],
      staff,
    ),
  );
  assert.deepEqual([backStatus.done, backStatus.skipped], [2, { changed: 1 }]);
  assert.deepEqual([await statusOf(a.id), await statusOf(b.id)], ["OPEN", "OPEN"]);
  const backVisit = await inTx((tx) =>
    undoStatusEach(tx, [{ id: draft.id, from: "DRAFT", to: "DRAFT", waitingOn: null, scheduledFor: "2026-12-01", setWaitingOn: null, setScheduledFor: null, approvedEventId: null }], staff),
  );
  assert.deepEqual([backVisit.done, backVisit.skipped], [0, { changed: 1 }]);
  await untouched("a status Undo");

  // ---- Assignee: to Jose (the draft is Zack's), and to nobody ----
  const assign = await inTx((tx) =>
    assignEach(tx, [{ id: draft.id, expected: { contactId: zack.contactId } }, { id: a.id, expected: null }, { id: b.id, expected: { contactId: joseId } }], { contactId: joseId }, staff),
  );
  assert.deepEqual([assign.done, assign.skipped, assign.emails], [2, { changed: 1 }, 1], "a is Jose's now and b already was; one job email, for a");
  assert.deepEqual(assign.changed.map((c) => c.id), [a.id]);
  const nobody = await inTx((tx) => assignEach(tx, [{ id: draft.id, expected: { contactId: zack.contactId } }], null, staff));
  assert.deepEqual([nobody.done, nobody.skipped, nobody.emails], [0, { changed: 1 }, 0]);
  await untouched("an assignee for many");
  // Its Undo, with a line that names the draft's own assignee as the one to take off.
  const backAssign = await inTx((tx) => undoAssignEach(tx, [...assign.changed, { id: draft.id, from: null, to: { contactId: zack.contactId }, fromName: "Mike (Asana)" }], staff));
  assert.deepEqual([backAssign.done, backAssign.skipped], [1, { changed: 1 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).assigneeContactId, null);
  await untouched("an assignee Undo");

  // ---- Property: to Congress (which has a Rear unit too), and to none ----
  const move = await inTx((tx) => setPropertyEach(tx, [draft.id, a.id], congress, staff));
  assert.deepEqual([move.done, move.skipped], [1, { changed: 1 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).propertyId, congress);
  const none = await inTx((tx) => setPropertyEach(tx, [draft.id], null, staff));
  assert.deepEqual([none.done, none.skipped], [0, { changed: 1 }]);
  await untouched("a property for many");
  const backMove = await inTx((tx) =>
    undoPropertyEach(tx, [...move.changed, { id: draft.id, from: { propertyId: congress, unitLabel: "Front" }, to: { propertyId: crescent, unitLabel: "Rear" } }], staff),
  );
  assert.deepEqual([backMove.done, backMove.skipped], [1, { changed: 1 }]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).propertyId, crescent);
  await untouched("a property Undo");

  // ---- Due date: a new date (a contractor's job and a plain task move the same way now), and cleared ----
  {
    const dated = await inTx((tx) => moveDatesEach(tx, [draft.id, a.id], "2026-12-10", staff));
    assert.deepEqual([dated.done, dated.skipped], [1, { changed: 1 }], "skipped as a draft, not as a closed task");
  }
  const cleared = await inTx((tx) => moveDatesEach(tx, [draft.id, a.id], null, staff));
  assert.deepEqual([cleared.done, cleared.skipped], [1, { changed: 1 }]);
  assert.deepEqual(cleared.changed, [{ id: a.id, field: "dueDate", value: "2026-12-10", set: null }]);
  await untouched("a date for many");
  const backDates = await inTx((tx) => undoDatesEach(tx, [...cleared.changed, { id: draft.id, field: "dueDate", value: null, set: "2026-11-25" }], staff));
  assert.deepEqual([backDates.done, backDates.skipped], [1, { changed: 1 }]);
  assert.equal(toYmd((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).dueDate), "2026-12-10");
  await untouched("a date Undo");

  // After all of it Zack still can't open it, nothing waits to be sent about it, and Add works as if none of it happened.
  assert.equal(await prisma.taskAccess.count({ where: { taskId: draft.id } }), 0);
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: draft.id } }), 0);
  const added = await inTx((tx) => core.addDraft(tx, draft.id, staff));
  assert.deepEqual([added.task.status, added.task.assigneeContactId, toYmd(added.task.dueDate), added.task.propertyId, added.task.unitLabel], ["OPEN", zack.contactId, "2026-11-25", crescent, "Rear"]);
});

test("bulk delete leaves a draft sent with real tasks' ids, by its own read and by the delete's lock; a discarded one counts as gone", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const before = await whole(draft.id);
  const a = await make({ title: "Gone for good", propertyId: crescent });
  const b = await make({ title: "Gone too", status: "DONE" });
  const gone = await make({ title: "Gone already" });
  await prisma.task.delete({ where: { id: gone.id } });

  // service.deleteTask loads Next and the Blob client, which node:test can't, so the rule it runs stands in
  // (core.deleteTask in its own transaction). bulk.test.ts pins that bulk.ts hands deleteEach the real one.
  const handed: string[] = [];
  const remove = async (id: string) => {
    handed.push(id);
    await prisma.$transaction((tx) => core.deleteTask(tx, id, staff));
  };
  const failed: unknown[] = [];
  const out = await deleteEach(prisma, [a.id, draft.id, b.id, gone.id, draft.id], remove, (err) => failed.push(err));
  assert.deepEqual(out, { deleted: 3, failed: 0, drafts: 1 });
  assert.deepEqual(handed, [a.id, b.id, gone.id], "the draft never reached the delete");
  assert.equal(await prisma.task.count({ where: { id: { in: [a.id, b.id] } } }), 0);
  assert.deepEqual(await whole(draft.id), before, "the draft is exactly as it was, checklist and timeline included");

  // The draft alone: nothing deleted, nothing failed.
  assert.deepEqual(await deleteEach(prisma, [draft.id], remove, (err) => failed.push(err)), { deleted: 0, failed: 0, drafts: 1 });
  assert.equal(handed.length, 3);

  // A task that became a draft again between that read and the delete (an Add's Undo): the read here still says To
  // do, and the delete itself refuses it under the row's lock. Counted as a draft, never as a failure.
  const stale = { task: { findUnique: async () => ({ status: "OPEN", discardedAt: null }) } } as unknown as Parameters<typeof deleteEach>[0];
  assert.deepEqual(await deleteEach(stale, [draft.id], remove, (err) => failed.push(err)), { deleted: 0, failed: 0, drafts: 1 });
  assert.equal(handed.at(-1), draft.id, "it reached the delete, which left it");
  assert.deepEqual(await whole(draft.id), before);

  // Discard is the draft's own way out: it only marks the row (core.ts discardDrafts). From then it is gone to
  // everyone, so a bulk delete that still holds its id counts it as deleted, and the row waits for the sweep.
  const discarded = await prisma.$transaction((tx) => core.discardDraft(tx, draft.id, staff));
  assert.deepEqual(discarded.ids, [draft.id]);
  assert.deepEqual(await deleteEach(prisma, [draft.id], remove, (err) => failed.push(err)), { deleted: 1, failed: 0, drafts: 0 });
  assert.equal(await prisma.task.count({ where: { id: draft.id } }), 1, "kept for Discard's Undo");
  assert.equal(failed.length, 0, "none of it was reported as a failure");
  // And no bulk change reaches it: it is gone, as a deleted task is.
  const moved = await prisma.$transaction((tx) => setStatusEach(tx, [{ id: draft.id, expected: "OPEN" as const }], "DONE", {}, staff));
  assert.deepEqual([moved.done, moved.skipped], [0, { gone: 1 }]);
  assert.equal(await statusOf(draft.id), "DRAFT");
});

/**
 * The lines the send run would email each contractor about a job, by the two rules it decides with
 * (notifications/outbox.ts drainDue, which loads Next and can't run here): whether the row goes at all, on the row
 * as its batch read finds it (content.ts dueRowVerdict), then what is left to say once it is claimed, on the job
 * and the access read again (claimedRowVerdict). Empty for a row closed unsent or with nothing to send; no entry
 * for a contractor with no row waiting.
 */
async function wouldEmail(taskId: string): Promise<Record<string, OutboxItem[]>> {
  const rows = await prisma.notificationOutbox.findMany({
    where: { taskId, recipientContactId: { not: null }, sentAt: null },
    orderBy: { id: "asc" },
    select: {
      items: true,
      taskId: true,
      recipientContactId: true,
      recipientUser: { select: { email: true } },
      recipientContact: { select: { active: true, portalAccount: { select: { email: true, status: true, jobEmails: true } } } },
      task: { select: { status: true, dueDate: true, scheduledFor: true, description: true, access: { where: { revokedAt: null }, select: { contactId: true } } } },
    },
  });
  const out: Record<string, OutboxItem[]> = {};
  for (const row of rows) {
    const first = dueRowVerdict(row);
    const second = first.send
      ? claimedRowVerdict({
          audience: first.delivery.audience,
          items: parseItems(row.items),
          job: first.task,
          hasAccess: first.task.access.some((x) => x.contactId === row.recipientContactId),
          today: todayYmdEastern(),
        })
      : null;
    out[row.recipientContactId!] = second?.send ? second.items : [];
  }
  return out;
}

test("Add then its Undo emails the contractor nothing: the row the Add queued goes with the Undo", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const added = await prisma.$transaction((tx) => core.addDraft(tx, draft.id, staff));
  // While it is a task, the email is real: one "assigned you" for Zack, waiting.
  assert.deepEqual((await wouldEmail(draft.id))[zack.contactId]?.map((i) => i.kind), ["ASSIGNED"]);

  await prisma.$transaction((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, staff));
  assert.equal(await statusOf(draft.id), "DRAFT");
  assert.equal(await prisma.taskAccess.count({ where: { taskId: draft.id } }), 0);
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: draft.id } }), 0, "no email row is left, to him or to the partners");
  assert.deepEqual(await wouldEmail(draft.id), {});
});

test("a bulk Undo that arrives after the task became a draft again skips it, and nobody is emailed about any of it", { skip, timeout }, async () => {
  // The one way the list itself can send a draft's id: the draft was added (a task, picked and edited in bulk), then
  // the Add was undone inside its two minutes while the bulk edits' Undo toasts were still up.
  const draft = await saveDraft();
  const added = await prisma.$transaction((tx) => core.addDraft(tx, draft.id, staff));
  const assign = await prisma.$transaction((tx) => assignEach(tx, [{ id: draft.id, expected: { contactId: zack.contactId } }], { contactId: joseId }, staff));
  const dates = await prisma.$transaction((tx) => moveDatesEach(tx, [draft.id], "2026-12-15", staff));
  assert.deepEqual([assign.done, assign.emails, dates.done], [1, 1, 1], "while it's a task, bulk edit changes it as any task");
  // Zack was told he's off it (the line carries the job as he knew it); Jose was handed it and its new date.
  const queued = async (contactId: string) =>
    (await prisma.notificationOutbox.findMany({ where: { taskId: draft.id, recipientContactId: contactId, sentAt: null } })).flatMap((r) => parseItems(r.items).map((i) => i.kind));
  assert.deepEqual([await queued(zack.contactId), await queued(joseId)], [["ASSIGNED", "OFF"], ["ASSIGNED", "TARGET"]]);
  const [zackRow] = await prisma.notificationOutbox.findMany({ where: { taskId: draft.id, recipientContactId: zack.contactId, sentAt: null } });
  const off = parseItems(zackRow.items).find((i) => i.kind === "OFF");
  assert.equal(off?.job, jobKey({ status: "OPEN", due: "2026-11-25", scheduled: null, notes: "Bring the tall ladder." }), "the 'took you off' line carries the job as Zack knew it");

  await prisma.$transaction((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, staff));
  const asDraft = await whole(draft.id);
  assert.deepEqual([asDraft?.status, asDraft?.assigneeContactId, (asDraft?.access as unknown[]).length], ["DRAFT", joseId, 0], "a draft again, as the bulk edits left the task");

  const backAssign = await prisma.$transaction((tx) => undoAssignEach(tx, assign.changed, staff));
  const backDates = await prisma.$transaction((tx) => undoDatesEach(tx, dates.changed, staff));
  assert.deepEqual([backAssign.done, backAssign.skipped, backDates.done, backDates.skipped], [0, { changed: 1 }, 0, { changed: 1 }]);
  assert.deepEqual(await whole(draft.id), asDraft, "neither Undo touched the draft: no line, no access, no email row");

  // Nothing goes to either contractor: the Undo deleted what the task's time as a task had queued for both.
  assert.deepEqual(await wouldEmail(draft.id), {});
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: draft.id } }), 0);
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
