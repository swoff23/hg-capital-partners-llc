import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { hashToken, newToken } from "@/lib/portal/tokens";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "@/lib/tasks/core";
import { routeReply, type Envelope } from "./reply-sender";

/**
 * Where a received email goes, on a real Postgres (docs/specs/emails-redesign.md, section 7): a contractor's reply
 * that can't post goes to the partners with the job named and why; a partner's reply about a contractor who left
 * the job posts Internal; a fresh email from a contractor's login reaches the partners; unknown senders drop.
 *
 * Opt-in like job-emails.pg.test.ts, by the same guard: `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a
 * local scratch database (its name must contain "scratch"); it writes rows there and deletes them when it finishes.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/email/reply-sender.pg.test.ts
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
const timeout = 30_000;

const JOBS = "jobs@mail.hg.test";

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
let staff: Extract<core.Principal, { kind: "staff" }>;
let connorEmail: string;
let zackId: string;
let zackEmail: string;
let zackAccountId: string;
let mikeId: string;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  const run = randomUUID().slice(0, 8);
  connorEmail = `connor-${run}@example.test`;
  const connor = await made.user({ email: connorEmail, name: "Connor", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor" };
  zackId = (await made.contact({ fullName: "Zack Miller" })).id;
  zackEmail = `zack-${run}@example.test`;
  zackAccountId = (await prisma.portalAccount.create({ data: { contactId: zackId, email: zackEmail, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: new Date() } })).id;
  mikeId = (await made.contact({ fullName: "Mike Ortiz" })).id;
  await prisma.portalAccount.create({ data: { contactId: mikeId, email: `mike-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: new Date() } });
  propertyId = (await made.property({ address: `${run} Reply St, Buffalo, NY 14213` })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

/** A job Connor gives Zack, with Zack's reply address and Connor's (which names Zack, as partner REPLY links will). */
async function zacksJob(title: string) {
  const task = await prisma.$transaction((tx) => core.createTask(tx, { title, propertyId, assignee: { contactId: zackId } }, staff));
  const zackToken = newToken();
  const connorToken = newToken();
  await prisma.jobLink.create({ data: { tokenHash: hashToken(zackToken), kind: "REPLY", taskId: task.id, contactId: zackId } });
  await prisma.jobLink.create({ data: { tokenHash: hashToken(connorToken), kind: "REPLY", taskId: task.id, userId: staff.userId, contactId: zackId } });
  return { taskId: task.id, zackToken, connorToken };
}

const envelope = (from: string, to: string[], extra: Partial<Envelope> = {}): Envelope => ({
  from,
  to,
  cc: null,
  received_for: null,
  headers: null,
  authentication: { dmarc: "pass" },
  ...extra,
});
const viaToken = (from: string, token: string) => envelope(from, [`HG Capital <r+${token}@mail.hg.test>`], { authentication: { dmarc: "fail" } });

test("on the job, Zack's reply and Connor's answer post Shared", { skip, timeout }, async () => {
  const { taskId, zackToken, connorToken } = await zacksJob("Fix the porch rail");
  const zack = await routeReply(prisma, viaToken(zackEmail, zackToken), [JOBS]);
  assert.equal(zack.route, "post");
  assert.ok(zack.route === "post" && zack.taskId === taskId && zack.p.kind === "contractor" && zack.visibility === "SHARED" && zack.loginEmail === zackEmail);
  const connor = await routeReply(prisma, viaToken(connorEmail, connorToken), [JOBS]);
  assert.ok(connor.route === "post" && connor.p.kind === "staff" && connor.visibility === "SHARED");
});

test("taken off the job: Zack's reply goes to the partners, and Connor's answer about him posts Internal", { skip, timeout }, async () => {
  const { taskId, zackToken, connorToken } = await zacksJob("Patch the ceiling");
  await prisma.$transaction((tx) => core.patchTask(tx, taskId, { assignee: { contactId: mikeId } }, staff));
  const zack = await routeReply(prisma, viaToken(zackEmail, zackToken), [JOBS]);
  assert.deepEqual(zack, {
    route: "forward",
    taskId,
    why: "off-task",
    from: { contactId: zackId, fullName: "Zack Miller", loginEmail: zackEmail, reachable: false },
  });
  const connor = await routeReply(prisma, viaToken(connorEmail, connorToken), [JOBS]);
  assert.ok(connor.route === "post" && connor.visibility === "INTERNAL", "a note meant for Zack never reaches Mike");
});

test("a closed job: the reply goes to the partners, and a partner's answer would still reach Zack", { skip, timeout }, async () => {
  const { taskId, zackToken } = await zacksJob("Seal the driveway");
  await prisma.task.update({ where: { id: taskId }, data: { status: "DONE" } });
  const zack = await routeReply(prisma, viaToken(zackEmail, zackToken), [JOBS]);
  assert.ok(zack.route === "forward" && zack.why === "closed" && zack.taskId === taskId && zack.from.reachable === true);
});

test("Remove access: the retired address still reaches the partners, as login off, and Connor's answer posts Internal", { skip, timeout }, async () => {
  const { taskId, zackToken, connorToken } = await zacksJob("Replace the storm door");
  await prisma.portalAccount.update({ where: { id: zackAccountId }, data: { status: "DISABLED" } });
  // As disablePortalAccountIn does (job-links.ts revokeJobLinksFor): Zack's own links stop, a partner's that names him doesn't.
  await prisma.jobLink.updateMany({ where: { contactId: zackId, userId: null, revokedAt: null }, data: { revokedAt: new Date() } });
  try {
    const zack = await routeReply(prisma, viaToken(zackEmail, zackToken), [JOBS]);
    assert.ok(zack.route === "forward" && zack.why === "login-off" && zack.taskId === taskId && zack.from.reachable === false);
    const connor = await routeReply(prisma, viaToken(connorEmail, connorToken), [JOBS]);
    assert.ok(connor.route === "post" && connor.visibility === "INTERNAL", "Connor's answer stays with the partners");
    await prisma.jobLink.updateMany({ where: { taskId, userId: staff.userId }, data: { revokedAt: new Date() } });
    assert.deepEqual(await routeReply(prisma, viaToken(connorEmail, connorToken), [JOBS]), { route: "ignore", reason: "no job" }, "a partner's link retired on purpose");
  } finally {
    await prisma.portalAccount.update({ where: { id: zackAccountId }, data: { status: "ACTIVE" } });
  }
});

test("Sign out everywhere: an old reply address can't post, so it goes to the partners", { skip, timeout }, async () => {
  const { taskId, zackToken } = await zacksJob("Clean the gutters");
  await prisma.jobLink.updateMany({ where: { contactId: zackId, taskId, userId: null }, data: { revokedAt: new Date() } });
  const zack = await routeReply(prisma, viaToken(zackEmail, zackToken), [JOBS]);
  assert.ok(zack.route === "forward" && zack.why === "old-link" && zack.from.reachable === true);
});

test("the plain address: a thread that names the job posts with DMARC pass, and nothing without it", { skip, timeout }, async () => {
  const { taskId } = await zacksJob("Paint the trim");
  const headers = { references: `<job-${taskId}@mail.hg.test>` };
  const ok = await routeReply(prisma, envelope(`Zack Miller <${zackEmail}>`, [JOBS], { headers }), [JOBS]);
  assert.ok(ok.route === "post" && ok.p.kind === "contractor" && ok.taskId === taskId);
  const forged = await routeReply(prisma, envelope(zackEmail, [JOBS], { headers, authentication: { dmarc: "fail" } }), [JOBS]);
  assert.deepEqual(forged, { route: "ignore", reason: "no job" });
  const disguised = await routeReply(prisma, envelope(`"${connorEmail}" <${zackEmail}>`, [JOBS], { headers }), [JOBS]);
  assert.deepEqual(disguised, { route: "ignore", reason: "no job" });
});

test("a fresh email from Zack's login reaches the partners; to another address, or from a stranger, it drops", { skip, timeout }, async () => {
  const fresh = await routeReply(prisma, envelope(zackEmail, [`Jobs <${JOBS}>`]), [JOBS]);
  assert.deepEqual(fresh, {
    route: "forward",
    taskId: null,
    why: "no-job",
    from: { contactId: zackId, fullName: "Zack Miller", loginEmail: zackEmail, reachable: true },
  });
  assert.equal((await routeReply(prisma, envelope(zackEmail, ["someone-else@mail.hg.test"]), [JOBS])).route, "ignore");
  assert.equal((await routeReply(prisma, envelope(zackEmail, [JOBS], { authentication: { dmarc: "fail" } }), [JOBS])).route, "ignore");
  assert.deepEqual(await routeReply(prisma, envelope("stranger@example.test", [JOBS]), [JOBS]), { route: "ignore", reason: "no job" });
  // A partner writing in fresh has the app: nothing to forward.
  assert.equal((await routeReply(prisma, envelope(connorEmail, [JOBS]), [JOBS])).route, "ignore");
});

test("a reply address whose job was deleted: a known contractor's reply reaches the partners as a fresh email", { skip, timeout }, async () => {
  const unknown = newToken();
  const reply = await routeReply(prisma, envelope(zackEmail, [`r+${unknown}@mail.hg.test`]), [JOBS]);
  assert.ok(reply.route === "forward" && reply.why === "no-job" && reply.taskId === null);
  // Without DMARC there is no telling who sent it.
  assert.equal((await routeReply(prisma, envelope(zackEmail, [`r+${unknown}@mail.hg.test`], { authentication: { dmarc: "fail" } }), [JOBS])).route, "ignore");
});
