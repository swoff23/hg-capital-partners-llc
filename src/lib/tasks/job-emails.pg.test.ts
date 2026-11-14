import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { setJobEmailsIn } from "@/lib/portal/accounts-core";
import * as core from "./core";

/**
 * Which changes queue a contractor an email, on a real Postgres through the
 * app's driver (docs/specs/contractor-email-switch.md): none before their
 * first sign-in, none with their Job emails switch off, and the partners
 * still hear about what the contractor does either way. The fake transaction
 * in core.test.ts shows the rule is asked; this shows the column, its
 * default and the compare-and-set that flips it.
 *
 * Opt-in like undo-approval.pg.test.ts, by the same guard: `npm test` skips it
 * unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name
 * must contain "scratch"); it writes rows there and leaves them.
 *
 *   createdb -h localhost hg_emails_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_emails_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_emails_scratch npx tsx --test src/lib/tasks/job-emails.pg.test.ts
 *   dropdb -h localhost hg_emails_scratch
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
let staff: Extract<core.Principal, { kind: "staff" }>;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let accountId: string;
let staffIds: string[];
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  const run = randomUUID().slice(0, 8);
  const connor = await prisma.user.create({ data: { email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" } });
  const pieter = await prisma.user.create({ data: { email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" } });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  staffIds = [connor.id, pieter.id];
  const contact = await prisma.contact.create({ data: { fullName: "Zack Quiet" } });
  // A new login as Create login leaves it: active, never signed in, and nothing said about the switch.
  const account = await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE" },
  });
  accountId = account.id;
  zack = { kind: "contractor", contactId: contact.id, label: "Zack Quiet" };
  propertyId = (await prisma.property.create({ data: { address: `${run} Hush St, Buffalo, NY 14213` } })).id;
});

after(async () => {
  if (!skip) await prisma.$disconnect();
});

/** A job Connor makes and assigns to Zack: its "assigned you" is the email in question. */
async function assignJob(title: string): Promise<string> {
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title, propertyId, assignee: { contactId: zack.contactId } }, staff));
  return task.id;
}
const rowsForZack = (taskId: string) => prisma.notificationOutbox.count({ where: { taskId, recipientContactId: zack.contactId } });
const rowsForPartners = (taskId: string) => prisma.notificationOutbox.count({ where: { taskId, recipientUserId: { in: staffIds } } });

test("a new login's switch starts on, and nothing is queued for it before the first sign-in", { skip, timeout }, async () => {
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: accountId }, select: { jobEmails: true, lastSignInAt: true } });
  assert.deepEqual(account, { jobEmails: true, lastSignInAt: null }, "the column's default");

  const taskId = await assignJob("Patch the hallway drywall");
  assert.equal(await rowsForZack(taskId), 0, "assigned, and not emailed");
  await prisma.$transaction((tx) => core.addComment(tx, taskId, { body: "Key is under the mat.", visibility: "SHARED" }, staff));
  assert.equal(await rowsForZack(taskId), 0, "a shared comment, and not emailed");
  // He can see the job the moment he signs in: quiet is about email, not access.
  assert.equal(await prisma.taskAccess.count({ where: { taskId, contactId: zack.contactId, revokedAt: null } }), 1);
});

test("after the first sign-in a change queues his email, and nothing catches him up on what came before", { skip, timeout }, async () => {
  const before = await assignJob("Replace the porch light");
  assert.equal(await rowsForZack(before), 0);

  await prisma.portalAccount.update({ where: { id: accountId }, data: { lastSignInAt: new Date() } });
  assert.equal(await rowsForZack(before), 0, "signing in sends nothing for the job he was already given");

  const afterwards = await assignJob("Rehang the back door");
  assert.equal(await rowsForZack(afterwards), 1, "the next assignment is emailed");
  await prisma.$transaction((tx) => core.addComment(tx, before, { body: "Bulb is in the kitchen drawer.", visibility: "SHARED" }, staff));
  assert.equal(await rowsForZack(before), 1, "and so is the next change to the earlier job");
});

test("Job emails off: nothing more is queued for him, the flip is logged once, and the partners still hear from him", { skip, timeout }, async () => {
  await prisma.portalAccount.update({ where: { id: accountId }, data: { lastSignInAt: new Date(), jobEmails: true } });
  const logged = () => prisma.securityEvent.count({ where: { contactId: zack.contactId, data: { path: ["action"], equals: "job-emails-off" } } });
  const base = await logged();

  assert.equal(await prisma.$transaction((tx) => setJobEmailsIn(tx, accountId, false, { id: staff.userId })), true);
  // Pieter's tap a moment later finds it off already: no second row.
  assert.equal(await prisma.$transaction((tx) => setJobEmailsIn(tx, accountId, false, { id: staffIds[1] })), false);
  assert.equal(await logged(), base + 1);

  const taskId = await assignJob("Caulk the upstairs tub");
  await prisma.$transaction((tx) => core.addComment(tx, taskId, { body: "White caulk, not clear.", visibility: "SHARED" }, staff));
  assert.equal(await rowsForZack(taskId), 0, "assigned and commented on, and not emailed");

  // What he does still reaches Connor and Pieter: the switch is about email to him.
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  await prisma.$transaction((tx) => core.setStatus(tx, taskId, "REVIEW", zack, { note: "Done, tub is curing." }));
  assert.equal(await rowsForPartners(taskId), 2, "one row for each partner");
  assert.equal(await rowsForZack(taskId), 0);

  // Back on: the next change is emailed again, and the ones made while it was off are not.
  assert.equal(await prisma.$transaction((tx) => setJobEmailsIn(tx, accountId, true, { id: staff.userId })), true);
  assert.equal(await rowsForZack(taskId), 0, "turning it on sends no catch-up");
  await prisma.$transaction((tx) => core.addComment(tx, taskId, { body: "Looks good, thanks.", visibility: "SHARED" }, staff));
  assert.equal(await rowsForZack(taskId), 1);
});
