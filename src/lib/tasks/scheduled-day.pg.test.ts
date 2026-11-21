import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { toYmd } from "@/lib/dates";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "./core";

/**
 * The contractor's scheduled day against a real database
 * (docs/specs/contractor-scheduled-date.md): their pick never touches Due, it
 * turns a To do or Waiting job Scheduled, and the 8 am lines keep to one per
 * job per morning.
 *
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch"); it deletes its rows when it
 * finishes (scratch-rows.ts).
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch (job-batch.pg.test.ts's rule). */
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
  const contact = await made.contact({ fullName: "Zack Day" });
  // Signed in once with Job emails on, so changes queue his emails.
  await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: new Date() },
  });
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Day" };
  propertyId = (await made.property({ address: `${run} Calendar St, Buffalo, NY 14213` })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

async function job(title: string, dueDate: string): Promise<string> {
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title, propertyId, dueDate, assignee: { contactId: zack.contactId } }, staff));
  return task.id;
}
const read = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

test("their pick turns a To do job Scheduled and never touches Due", { skip, timeout }, async () => {
  const id = await job("Fix the kitchen faucet", "2026-11-19");
  await prisma.$transaction((tx) => core.scheduleByContractor(tx, id, "2026-11-17", zack));
  let t = await read(id);
  assert.deepEqual([t.status, toYmd(t.scheduledFor), toYmd(t.dueDate)], ["SCHEDULED", "2026-11-17", "2026-11-19"]);

  // A move, later than Due: allowed, and Due still stands.
  await prisma.$transaction((tx) => core.scheduleByContractor(tx, id, "2026-11-23", zack));
  t = await read(id);
  assert.deepEqual([t.status, toYmd(t.scheduledFor), toYmd(t.dueDate)], ["SCHEDULED", "2026-11-23", "2026-11-19"]);
  const moved = await prisma.taskEvent.findFirst({ where: { taskId: id, kind: "SCHEDULED" }, orderBy: { createdAt: "desc" } });
  assert.deepEqual(moved?.data, { from: "2026-11-17", to: "2026-11-23" });
  assert.equal(await prisma.taskEvent.count({ where: { taskId: id, kind: "DUE", actorContactId: zack.contactId } }), 0, "no Due line in his name");
});

test("their pick on a Waiting job clears the reason; after Start they can't move it", { skip, timeout }, async () => {
  const id = await job("Hang the storm door", "2026-11-25");
  await prisma.$transaction((tx) => core.setStatus(tx, id, "WAITING", staff, { waitingOn: "the door" }));
  await prisma.$transaction((tx) => core.scheduleByContractor(tx, id, "2026-11-24", zack));
  const t = await read(id);
  assert.deepEqual([t.status, t.waitingOn, toYmd(t.scheduledFor)], ["SCHEDULED", null, "2026-11-24"]);

  await prisma.$transaction((tx) => core.setStatus(tx, id, "IN_PROGRESS", zack));
  await assert.rejects(
    prisma.$transaction((tx) => core.scheduleByContractor(tx, id, "2026-11-26", zack)),
    /can't change now/,
  );
});

test("8 am lines: one per job per morning, and a line the send run dropped doesn't hold a new one back", { skip, timeout }, async () => {
  const id = await job("Check the furnace", "2026-11-21");
  const who = { id, assigneeContactId: zack.contactId };
  const morning = new Date("2026-11-21T05:00:00Z");
  const at = new Date("2026-11-21T13:00:00Z");
  assert.equal(await prisma.$transaction((tx) => core.queueDueReminder(tx, who, "SCHEDULED_TODAY", "2026-11-21", at, morning)), true);
  // Started at 8:20, so this morning's pick turns into Due today: no second email.
  assert.equal(await prisma.$transaction((tx) => core.queueDueReminder(tx, who, "DUE_TODAY", "2026-11-21", new Date(at.getTime() + 20 * 60_000), morning)), false);
  // The right-away heads-up keeps only the per-kind rule.
  assert.equal(await prisma.$transaction((tx) => core.queueDueReminder(tx, who, "SCHEDULED_TOMORROW", "2026-11-22", at)), true);
  assert.equal(await prisma.$transaction((tx) => core.queueDueReminder(tx, who, "SCHEDULED_TOMORROW", "2026-11-22", at)), false);

  // The send run closed it as no longer true: the same line may be queued again later.
  await prisma.notificationOutbox.updateMany({ where: { taskId: id }, data: { sentAt: at, lastError: "nothing to send", openKey: null } });
  assert.equal(await prisma.$transaction((tx) => core.queueDueReminder(tx, who, "SCHEDULED_TOMORROW", "2026-11-22", at)), true);
});
