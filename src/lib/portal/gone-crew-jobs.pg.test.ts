import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient, TaskStatus } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "@/lib/tasks/core";
import { findGoneCrewJob, keepGoneCrewJob } from "./gone-crew-jobs";
import { CANCELED_HEADING } from "./gone-job-text";
import { GONE_CREW_JOB_KEEP_MS, sessionExpiresAt } from "./limits";
import { hashToken, newToken } from "./tokens";

/**
 * A deleted job's note for its crew (gone-crew-jobs.ts, docs/specs/emails-redesign.md Q7) against a real database:
 * deleteTask keeps one for each crew link and live crew session, keyed by the token's hash, and only the holder of
 * that token reads it back, as canceled with the title and street. A contractor's own link and session, a revoked
 * session, the other kind and a made-up token read nothing, and nothing reads past 30 days.
 *
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name must contain
 * "scratch"); it deletes its rows when it finishes (scratch-rows.ts, and its own notes below).
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
const DAY = 24 * 60 * 60 * 1000;

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
/** Every token hash this file may have left a note under; the notes have no foreign key, so nothing cascades them. */
const noted: string[] = [];
let run: string;
let staff: core.Principal;
let contactId: string;
let accountId: string;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = randomUUID().slice(0, 8);
  const connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  const contact = await made.contact({ fullName: "Zack Miller" });
  contactId = contact.id;
  accountId = (
    await prisma.portalAccount.create({
      data: { contactId, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() },
    })
  ).id;
  propertyId = (await made.property({ address: `118 Congress St ${run}, Buffalo, NY 14201` })).id;
});

after(async () => {
  if (skip) return;
  await prisma.goneCrewJob.deleteMany({ where: { tokenHash: { in: noted } } });
  await made.remove();
  await prisma.$disconnect();
});

/** A job given to Zack, with a link of each kind and a session from each, as his email and his crew text start them. */
async function jobWithCrew(status: TaskStatus, now: Date) {
  const task = await prisma.task.create({
    data: { title: `Replace back door ${run}`, status, propertyId, unitLabel: "Rear", assigneeContactId: contactId, access: { create: { contactId } } },
  });
  const tokens = { crewLink: newToken(), emailLink: newToken(), crewSession: newToken(), revokedCrewSession: newToken(), emailSession: newToken() };
  noted.push(...Object.values(tokens).map(hashToken));
  const crew = await prisma.jobLink.create({ data: { tokenHash: hashToken(tokens.crewLink), kind: "CREW", taskId: task.id, contactId } });
  const email = await prisma.jobLink.create({ data: { tokenHash: hashToken(tokens.emailLink), kind: "EMAIL", taskId: task.id, contactId } });
  const session = (token: string, jobLinkId: string, revokedAt: Date | null = null) =>
    prisma.portalSession.create({
      data: { accountId, tokenHash: hashToken(token), expiresAt: sessionExpiresAt(now), onlyTaskId: task.id, jobLinkId, revokedAt },
    });
  await session(tokens.crewSession, crew.id);
  await session(tokens.revokedCrewSession, crew.id, now);
  await session(tokens.emailSession, email.id);
  return { taskId: task.id, tokens };
}

const remove = (taskId: string, now: Date) => prisma.$transaction((tx) => core.deleteTask(tx, taskId, staff, now));

test("deleting a job keeps a note for its crew link and live crew session, and only their holders read it", { skip, timeout }, async () => {
  const now = new Date();
  const { taskId, tokens } = await jobWithCrew("SCHEDULED", now);
  assert.ok(await remove(taskId, now));
  assert.equal(await prisma.jobLink.count({ where: { taskId } }), 0, "the links went with the job");
  assert.equal(await prisma.portalSession.count({ where: { onlyTaskId: taskId } }), 0, "and the sessions");

  const link = await findGoneCrewJob(prisma, "LINK", tokens.crewLink, now);
  assert.equal(link?.heading, CANCELED_HEADING);
  assert.equal(link?.title, `Replace back door ${run}`);
  assert.equal(link?.street, `118 Congress St ${run} · Rear`);
  assert.deepEqual(await findGoneCrewJob(prisma, "SESSION", tokens.crewSession, now), link, "the open page reads the same words");

  // Exactly two rows, both hashes: the raw tokens are nowhere in the table.
  const rows = await prisma.goneCrewJob.findMany({ where: { tokenHash: { in: noted } } });
  assert.deepEqual(rows.map((r) => r.kind).sort(), ["LINK", "SESSION"]);
  assert.ok(rows.every((r) => !Object.values(tokens).includes(r.tokenHash)));

  assert.equal(await findGoneCrewJob(prisma, "LINK", tokens.emailLink, now), null, "his own email link keeps going to sign in");
  assert.equal(await findGoneCrewJob(prisma, "SESSION", tokens.emailSession, now), null, "and his own email-link session");
  assert.equal(await findGoneCrewJob(prisma, "SESSION", tokens.revokedCrewSession, now), null, "a signed-out session too");
  assert.equal(await findGoneCrewJob(prisma, "SESSION", tokens.crewLink, now), null, "a link's token is not a cookie");
  assert.equal(await findGoneCrewJob(prisma, "LINK", tokens.crewSession, now), null, "nor a cookie a link");
  assert.equal(await findGoneCrewJob(prisma, "LINK", newToken(), now), null, "a made-up token reads nothing");
  assert.equal(await findGoneCrewJob(prisma, "LINK", "not-a-token", now), null);

  // 30 days, then the link goes to sign in like any dead one. The session's note ends with the session.
  const later = new Date(now.getTime() + GONE_CREW_JOB_KEEP_MS + 1000);
  assert.equal(await findGoneCrewJob(prisma, "LINK", tokens.crewLink, later), null);
  const sessionRow = rows.find((r) => r.kind === "SESSION");
  assert.equal(sessionRow?.expiresAt.getTime(), sessionExpiresAt(now).getTime());
});

test("a canceled job's delete keeps the note; a Done job's keeps nothing", { skip, timeout }, async () => {
  const now = new Date();
  const canceled = await jobWithCrew("CANCELED", now);
  await remove(canceled.taskId, now);
  assert.equal((await findGoneCrewJob(prisma, "LINK", canceled.tokens.crewLink, now))?.heading, CANCELED_HEADING);

  const done = await jobWithCrew("DONE", now);
  await remove(done.taskId, now);
  assert.equal(await findGoneCrewJob(prisma, "LINK", done.tokens.crewLink, now), null, "a Done job's link still goes to sign in");
  assert.equal(await findGoneCrewJob(prisma, "SESSION", done.tokens.crewSession, now), null);
});

test("the next delete that writes notes purges the expired ones, and a job no crew opened writes nothing", { skip, timeout }, async () => {
  const now = new Date();
  const stale = hashToken(newToken());
  noted.push(stale);
  await prisma.goneCrewJob.create({ data: { tokenHash: stale, kind: "LINK", title: "Old job", deletedAt: new Date(now.getTime() - 31 * DAY), expiresAt: new Date(now.getTime() - DAY) } });

  const bare = await prisma.task.create({ data: { title: `Gutters ${run}`, status: "OPEN", propertyId } });
  assert.equal(await prisma.$transaction((tx) => keepGoneCrewJob(tx, bare.id, now)), 0);
  assert.equal(await prisma.goneCrewJob.count({ where: { tokenHash: stale } }), 1, "nothing written, nothing purged");

  const { taskId } = await jobWithCrew("OPEN", now);
  await remove(taskId, now);
  assert.equal(await prisma.goneCrewJob.count({ where: { tokenHash: stale } }), 0, "purged");
});
