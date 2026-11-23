import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { todayYmdEastern } from "@/lib/dates";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "@/lib/tasks/core";
import { claimedRowVerdict, deletedRowVerdict, parseItems, type OutboxItem } from "./content";
import { newEmailRowsWhere } from "./reminder-rules";

/**
 * What core.ts queues for the redesigned emails (docs/specs/emails-redesign.md, Q2 and Q8), against a real database:
 * a partner's checklist edit and on hold, a status a partner sets that only rides along, nothing from a job in review,
 * a resident's cancel, a deleted job's Removed row, No day yet once, and the New rows the morning run reads.
 *
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name must contain "scratch");
 * it deletes its rows when it finishes (scratch-rows.ts).
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

function isLocalScratch(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname);
  } catch {
    return false;
  }
}

const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 30_000;

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
let staff: Extract<core.Principal, { kind: "staff" }>;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  const run = randomUUID().slice(0, 8);
  const connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  const contact = await made.contact({ fullName: "Zack Miller" });
  await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: new Date() },
  });
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Miller" };
  propertyId = (await made.property({ address: `${run} Congress St, Buffalo, NY 14213` })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

const tx = <T>(fn: (tx: core.Tx) => Promise<T>) => prisma.$transaction(fn);
async function job(title: string, over: Partial<core.NewTaskInput> = {}): Promise<string> {
  const task = await tx((t) => core.createTask(t, { title, propertyId, dueDate: "2026-12-04", assignee: { contactId: zack.contactId }, ...over }, staff));
  return task.id;
}
/** Zack's lines on a job: waiting, or every row's when `all`. */
async function zackLines(taskId: string, all = false): Promise<OutboxItem[]> {
  const rows = await prisma.notificationOutbox.findMany({ where: { taskId, recipientContactId: zack.contactId, ...(all ? {} : { sentAt: null }) }, orderBy: { createdAt: "asc" } });
  return rows.flatMap((r) => parseItems(r.items));
}
/** The New email went: close his waiting row as sent, so later lines start a row of their own. */
const sendAll = (taskId: string) => prisma.notificationOutbox.updateMany({ where: { taskId, sentAt: null }, data: { sentAt: new Date(), openKey: null } });

test("a partner's checklist edit emails the contractor, put back says nothing; a tick emails nobody", { skip, timeout }, async () => {
  const id = await job("Vanity swap");
  await sendAll(id);
  const added = await tx((t) => core.addChecklistItem(t, id, "Hook up the drain", staff));
  const lines = await zackLines(id);
  assert.deepEqual(lines.map((i) => [i.kind, i.summary]), [["CHECKLIST", 'added "Hook up the drain" to the checklist']]);
  // Taken off again inside the bundle: the list is as it was, so nothing goes.
  await tx((t) => core.removeChecklistItem(t, added.id, staff));
  const now = await prisma.task.findUniqueOrThrow({ where: { id }, select: { status: true, dueDate: true, scheduledFor: true, description: true, checklist: { select: { title: true } } } });
  assert.deepEqual(claimedRowVerdict({ audience: "contractor", items: await zackLines(id), job: now, hasAccess: true, today: todayYmdEastern() }), { send: false, reason: "nothing to send" });
  await sendAll(id);
  // A tick is work, not a change to the list.
  const kept = await tx((t) => core.addChecklistItem(t, id, "Level it", staff));
  await sendAll(id);
  await tx((t) => core.setChecklistItem(t, kept.id, true, staff));
  assert.deepEqual(await zackLines(id), []);
});

test("on hold emails the contractor; a status a partner sets for them only rides along, and the toast says so", { skip, timeout }, async () => {
  const id = await job("Furnace tune-up");
  await sendAll(id);
  const held = await tx((t) => core.setStatus(t, id, "WAITING", staff, { waitingOn: "National Fuel" }));
  assert.equal(held.emailsContractor, true);
  assert.deepEqual((await zackLines(id)).map((i) => [i.kind, i.from]), [["HOLD", "OPEN"]]);
  await sendAll(id);
  const started = await tx((t) => core.setStatus(t, id, "IN_PROGRESS", staff));
  assert.equal(started.emailsContractor, false, "no 'Zack gets an email' for a line that rides along");
  const lines = await zackLines(id);
  assert.deepEqual(lines.map((i) => [i.kind, i.from, i.to]), [["STATUS", "WAITING", "IN_PROGRESS"]]);
  const now = await prisma.task.findUniqueOrThrow({ where: { id }, select: { status: true, dueDate: true, scheduledFor: true, description: true } });
  assert.deepEqual(claimedRowVerdict({ audience: "contractor", items: lines, job: now, hasAccess: true, today: todayYmdEastern() }), { send: false, reason: "nothing to send" });
});

test("nothing from a job in review: no Removed for a cancel or a take-off, no Due change", { skip, timeout }, async () => {
  const id = await job("Caulk the tub");
  await tx((t) => core.setStatus(t, id, "IN_PROGRESS", zack));
  await tx((t) => core.setStatus(t, id, "REVIEW", zack));
  await sendAll(id);
  await tx((t) => core.patchTask(t, id, { dueDate: "2026-12-10" }, staff));
  await tx((t) => core.setStatus(t, id, "CANCELED", staff));
  assert.deepEqual(await zackLines(id), []);
  const other = await job("Paint trim");
  await tx((t) => core.setStatus(t, other, "IN_PROGRESS", zack));
  await tx((t) => core.setStatus(t, other, "REVIEW", zack));
  await sendAll(other);
  await tx((t) => core.patchTask(t, other, { assignee: null }, staff));
  assert.deepEqual(await zackLines(other), []);
});

test("a resident's cancel tells the contractor; a cancel on work under way says it was started", { skip, timeout }, async () => {
  const id = await job("Sink drips");
  await sendAll(id);
  await tx((t) => core.setStatus(t, id, "CANCELED", { kind: "system", label: "Dana Lee (resident)" }));
  const [off] = await zackLines(id);
  assert.deepEqual([off.kind, off.actorLabel, off.summary, off.from], ["OFF", "Dana Lee (resident)", 'canceled "Sink drips"', "OPEN"]);
  const busy = await job("Gutter clean");
  await tx((t) => core.setStatus(t, busy, "IN_PROGRESS", zack));
  await sendAll(busy);
  await tx((t) => core.setStatus(t, busy, "CANCELED", staff));
  assert.equal((await zackLines(busy))[0]?.from, "IN_PROGRESS");
});

test("a deleted job leaves its contractor a Removed row of its own; not when the job was handed over in the waiting bundle", { skip, timeout }, async () => {
  const id = await job("Vanity swap", { unitLabel: "Rear" });
  await sendAll(id);
  await tx((t) => core.deleteTask(t, id, staff));
  const rows = await prisma.notificationOutbox.findMany({ where: { taskId: null, recipientContactId: zack.contactId, sentAt: null }, include: { recipientContact: { select: { active: true, portalAccount: { select: { email: true, status: true, jobEmails: true } } } } } });
  assert.equal(rows.length, 1);
  const [off] = parseItems(rows[0].items);
  assert.deepEqual([off.kind, off.summary, off.title, off.where?.endsWith("Congress St · Rear")], ["OFF", 'deleted "Vanity swap"', "Vanity swap", true]);
  const verdict = deletedRowVerdict({ taskId: rows[0].taskId, items: rows[0].items, recipientUser: null, recipientContact: rows[0].recipientContact });
  assert.equal(verdict.send, true);
  assert.ok(rows[0].sendAfter.getTime() > Date.now(), "after the bundle's quiet time");
  await prisma.notificationOutbox.deleteMany({ where: { id: rows[0].id } });
  // Handed over and deleted before the New email went: nothing.
  const quick = await job("Paint the hall");
  await tx((t) => core.deleteTask(t, quick, staff));
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: null, recipientContactId: zack.contactId } }), 0);
});

test("No day yet queues once whatever the day; the morning run finds the New rows that went", { skip, timeout }, async () => {
  const id = await job("Patch the ceiling");
  const who = { id, assigneeContactId: zack.contactId };
  const since = new Date(Date.now() - 60_000);
  await sendAll(id);
  const rows = await prisma.notificationOutbox.findMany({ where: { ...newEmailRowsWhere(since), taskId: id } });
  assert.equal(rows.length, 1, "the sent New row");
  await prisma.notificationOutbox.updateMany({ where: { taskId: id }, data: { lastError: "nothing to send" } });
  assert.equal(await prisma.notificationOutbox.count({ where: { ...newEmailRowsWhere(since), taskId: id } }), 0, "one that never went doesn't count");
  assert.equal(await tx((t) => core.queueDueReminder(t, who, "NO_DAY", "2026-11-24", new Date())), true);
  assert.equal(await tx((t) => core.queueDueReminder(t, who, "NO_DAY", "2026-11-26", new Date())), false, "once");
  // Tell the tenant at once does nothing for a job with no day.
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });
  assert.equal(await tx((t) => core.queueTellTenantNow(t, task, new Date())), false);
});
