import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { routeReply, type Envelope } from "@/lib/email/reply-sender";
import { hashToken, newToken, residentLinkToken } from "@/lib/portal/tokens";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "@/lib/tasks/core";
import { REQUEST_CLOSED, ResidentRequestError, addResidentUpdate, residentPrincipal } from "./additions";
import { whyLinkEnded } from "./link-ended";

/**
 * A tenant's reply by email and an old link's page, on a real Postgres (docs/specs/tenant-welcome-email.md, Q1 and
 * Q2): a reply through a resident email's own address posts on an open request as the resident's own addition, by
 * email, once; one about no request, a closed request, or after moving out goes to the partners; anything not from
 * the tenant's own address with DMARC pass drops; the form link's token is never a reply address. An old link says
 * "replaced" only when a newer emailed link still works.
 *
 * Opt-in like reply-sender.pg.test.ts, by the same guard: `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a
 * local scratch database (its name must contain "scratch") with the migrations applied. It removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/residents/replies.pg.test.ts
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
const NOW = new Date("2026-11-23T15:00:00Z");

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
let propertyId: string;
let connorId: string;
let pieterId: string;
let danaId: string;
let danaEmail: string;
let leaseId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  connorId = (await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" })).id;
  pieterId = (await made.user({ email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" })).id;
  propertyId = (await made.property({ address: `${run} Lafayette Avenue, Buffalo, NY 14213` })).id;
  danaEmail = `Dana.Lee-${run}@example.test`;
  danaId = (await prisma.tenant.create({ data: { fullName: "Dana Lee", email: danaEmail } })).id;
  leaseId = (await newLease(danaId)).id;
});

after(async () => {
  if (skip) return;
  // Leases hold their property (Restrict) and tenants: they go first, taking links, reply addresses and requests.
  const leases = await prisma.lease.findMany({ where: { propertyId }, select: { id: true } });
  await prisma.task.deleteMany({ where: { propertyId } });
  await prisma.lease.deleteMany({ where: { id: { in: leases.map((l) => l.id) } } });
  await prisma.tenant.deleteMany({ where: { fullName: { in: ["Dana Lee", "Sam Ortiz"] }, email: { contains: run } } });
  await made.remove();
  await prisma.$disconnect();
});

function newLease(tenantId: string, over: { movesOut?: Date | null } = {}) {
  return prisma.lease.create({
    data: { propertyId, unitLabel: "Floor 2", movesIn: new Date("2025-06-01T00:00:00Z"), movesOut: over.movesOut ?? null, tenants: { create: { tenantId, primary: true, position: 0 } } },
  });
}

/** A request Dana sent, as submitRequest makes it: a task by "Dana Lee (resident)" beside its ResidentRequest. */
async function request(title: string, lease = leaseId, tenantId = danaId) {
  const task = await prisma.$transaction((tx) =>
    core.createTask(tx, { title, propertyId, unitLabel: "Floor 2", dueDate: "2026-11-23", entryPermitted: false }, residentPrincipal({ tenantName: "Dana Lee" }), NOW),
  );
  const r = await prisma.residentRequest.create({ data: { taskId: task.id, leaseId: lease, tenantId, tenantName: "Dana Lee", whatsWrong: title, letUsIn: false } });
  return { taskId: task.id, requestId: r.id };
}

/** A resident email's reply address, as reply-address.ts mints it. */
async function replyAddress(requestId: string | null, lease = leaseId, tenantId = danaId): Promise<string> {
  const token = newToken();
  await prisma.residentReplyAddress.create({ data: { tokenHash: hashToken(token), tenantId, leaseId: lease, requestId } });
  return `r+${token}@mail.hg.test`;
}

const envelope = (from: string, to: string, extra: Partial<Envelope> = {}): Envelope => ({
  from,
  to: [`HG Capital <${to}>`],
  cc: null,
  received_for: null,
  headers: null,
  authentication: { dmarc: "pass" },
  ...extra,
});
const route = (from: string, to: string, extra: Partial<Envelope> = {}) => routeReply(prisma, envelope(from, to, extra), [JOBS], NOW);

test("a reply about an open request posts there, from Dana's own address in any case", { skip, timeout }, async () => {
  const { taskId, requestId } = await request("Kitchen sink drips");
  const to = await replyAddress(requestId);
  const r = await route(`Dana Lee <${danaEmail.toLowerCase()}>`, to);
  assert.equal(r.route, "resident-post");
  assert.ok(r.route === "resident-post");
  assert.equal(r.taskId, taskId);
  assert.equal(r.requestId, requestId);
  assert.deepEqual(r.from, { tenantId: danaId, leaseId, fullName: "Dana Lee", address: `${run} Lafayette Avenue, Buffalo, NY 14213`, unitLabel: "Floor 2" });
});

test("only Dana's own address with DMARC pass counts: anyone else, a forgery or a disguise drops", { skip, timeout }, async () => {
  const { requestId } = await request("Bathroom fan is loud");
  const to = await replyAddress(requestId);
  const notTenant = { route: "ignore", reason: "not the tenant" };
  assert.deepEqual(await route(`someone-${run}@example.test`, to), notTenant, "a stranger who has the address");
  assert.deepEqual(await route(danaEmail, to, { authentication: { dmarc: "fail" } }), notTenant, "no DMARC pass");
  assert.deepEqual(await route(danaEmail, to, { authentication: null }), notTenant, "no checks at all");
  assert.deepEqual(await route(`"${danaEmail}" <someone-${run}@example.test>`, to), notTenant, "her address as a display name");
  // A tenant with no email on file has no address of their own to reply from.
  const sam = await prisma.tenant.create({ data: { fullName: "Sam Ortiz", email: null } });
  const samLease = await newLease(sam.id);
  assert.deepEqual(await route(danaEmail, await replyAddress(null, samLease.id, sam.id)), notTenant);
  await prisma.tenant.update({ where: { id: sam.id }, data: { email: `sam-${run}@example.test` } });
});

test("a reply to the form email, about no request, goes to both partners with the home named", { skip, timeout }, async () => {
  const r = await route(danaEmail, await replyAddress(null));
  assert.ok(r.route === "resident-forward");
  assert.equal(r.why, "no-request");
  assert.equal(r.taskId, null);
  assert.equal(r.from.leaseId, leaseId);
  assert.equal(r.from.unitLabel, "Floor 2");
});

test("a closed request: the reply goes to the partners instead of posting", { skip, timeout }, async () => {
  for (const status of ["DONE", "CANCELED"] as const) {
    const { taskId, requestId } = await request(`Porch light out ${status}`);
    await prisma.task.update({ where: { id: taskId }, data: { status } });
    const r = await route(danaEmail, await replyAddress(requestId));
    assert.ok(r.route === "resident-forward" && r.why === "closed" && r.taskId === taskId, status);
  }
});

test("after moving out, or taken off the lease, a reply goes to the partners", { skip, timeout }, async () => {
  const ended = await newLease(danaId, { movesOut: new Date("2026-11-01T00:00:00Z") });
  const { taskId, requestId } = await request("Window stuck", ended.id);
  const r = await route(danaEmail, await replyAddress(requestId, ended.id));
  assert.ok(r.route === "resident-forward" && r.why === "moved-out" && r.taskId === taskId);
  // Still on the move-out day itself: it posts, as the form's link still works that day.
  await prisma.lease.update({ where: { id: ended.id }, data: { movesOut: new Date("2026-11-23T00:00:00Z") } });
  assert.equal((await route(danaEmail, await replyAddress(requestId, ended.id))).route, "resident-post");
  await prisma.leaseTenant.delete({ where: { leaseId_tenantId: { leaseId: ended.id, tenantId: danaId } } });
  const off = await route(danaEmail, await replyAddress(requestId, ended.id));
  assert.ok(off.route === "resident-forward" && off.why === "moved-out");
});

test("a request deleted since: the reply still reaches the partners, as one about no request", { skip, timeout }, async () => {
  const { taskId, requestId } = await request("Garbage disposal jammed");
  const to = await replyAddress(requestId);
  await prisma.task.delete({ where: { id: taskId } });
  const r = await route(danaEmail, to);
  assert.ok(r.route === "resident-forward" && r.why === "no-request" && r.taskId === null);
});

test("the form link's token is never a reply address, and a reply address never opens the form", { skip, timeout }, async () => {
  const id = randomUUID().replace(/-/g, "");
  const formToken = residentLinkToken(id, "test-secret");
  await prisma.residentLink.create({ data: { id, tenantId: danaId, leaseId, tokenHash: hashToken(formToken) } });
  // Sent to r+<the form's token>: nothing knows it as a reply address, so a tenant's reply there drops.
  assert.equal((await route(danaEmail, `r+${formToken}@mail.hg.test`)).route, "ignore");
  // And a reply address's token names no link to open.
  const to = await replyAddress(null);
  const token = /^r\+([^@]+)@/.exec(to)![1];
  assert.equal(await prisma.residentLink.findUnique({ where: { tokenHash: hashToken(token) } }), null);
});

test("a reply by email posts as Dana's own addition, marked by email, once; both partners get the usual line", { skip, timeout }, async () => {
  const { taskId } = await request("Radiator clanks");
  const who = { tenantId: danaId, tenantName: "Dana Lee" };
  const photo = { url: "https://blob.test/a.jpg", pathname: `tasks/${taskId}/orig/a.jpg`, filename: "a.jpg", size: 1200, contentType: "image/jpeg", kind: "IMAGE" as const };
  const first = await prisma.$transaction((tx) => addResidentUpdate(tx, taskId, who, { note: "I'll be at work. The key is under the mat.", files: [photo], byEmail: "em-1" }, NOW));
  assert.ok(first);
  const event = await prisma.taskEvent.findUniqueOrThrow({ where: { id: first.eventId }, include: { attachments: true } });
  assert.equal(event.kind, "COMMENT");
  assert.equal(event.visibility, "SHARED");
  assert.equal(event.actorLabel, "Dana Lee (resident)");
  assert.equal(event.audienceContactId, null);
  assert.equal(event.body, "I'll be at work. The key is under the mat.");
  assert.deepEqual(event.data, { resident: danaId, byEmail: true, emailId: "em-1" });
  assert.deepEqual(event.attachments.map((a) => [a.filename, a.uploadedByTenantId, a.visibility]), [["a.jpg", danaId, "SHARED"]]);

  // Both partners: "Dana Lee (resident) added a note and 1 photo", as Add more on the form says it.
  const rows = await prisma.notificationOutbox.findMany({ where: { taskId, recipientUserId: { in: [connorId, pieterId] } } });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const items = row.items as { kind: string; actorLabel: string; summary: string; eventId?: string }[];
    assert.ok(items.some((i) => i.kind === "COMMENT" && i.actorLabel === "Dana Lee (resident)" && i.summary === "added a note and 1 photo" && i.eventId === first.eventId));
  }
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId, recipientContactId: { not: null } } }), 0, "never the contractor directly");

  // Resend delivers the same email again: nothing posts twice.
  const again = await prisma.$transaction((tx) => addResidentUpdate(tx, taskId, who, { note: "I'll be at work. The key is under the mat.", files: [], byEmail: "em-1" }, NOW));
  assert.equal(again, null);
  assert.equal(await prisma.taskEvent.count({ where: { taskId, kind: "COMMENT" } }), 1);

  // Closed since: refused with the form's own line, so the reply goes to the partners instead.
  await prisma.task.update({ where: { id: taskId }, data: { status: "DONE" } });
  await assert.rejects(
    prisma.$transaction((tx) => addResidentUpdate(tx, taskId, who, { note: "Still clanking", files: [], byEmail: "em-2" }, NOW)),
    (err) => err instanceof ResidentRequestError && err.message === REQUEST_CLOSED,
  );
});

test("an old link says replaced only while a newer emailed link still works", { skip, timeout }, async () => {
  const sam = await prisma.tenant.create({ data: { fullName: "Sam Ortiz", email: `sam2-${run}@example.test` } });
  const lease = await newLease(sam.id);
  const link = (createdAt: Date, data: { emailedAt?: Date | null; revokedAt?: Date | null } = {}) =>
    prisma.residentLink.create({ data: { tenantId: sam.id, leaseId: lease.id, tokenHash: hashToken(newToken()), createdAt, ...data } });
  const old = await link(new Date("2026-11-01T12:00:00Z"), { emailedAt: new Date("2026-11-01T12:00:00Z"), revokedAt: new Date("2026-11-20T12:00:00Z") });
  // Turned off with nothing newer: no longer works.
  assert.equal(await whyLinkEnded(prisma, old, true), "gone");
  // A newer one copied but never emailed: the newest email still has the old one.
  const copied = await link(new Date("2026-11-20T12:00:00Z"));
  assert.equal(await whyLinkEnded(prisma, old, true), "gone");
  // Send a new link: the newer one was emailed.
  await prisma.residentLink.update({ where: { id: copied.id }, data: { emailedAt: new Date("2026-11-20T12:01:00Z") } });
  assert.equal(await whyLinkEnded(prisma, old, true), "replaced");
  // Moved out: nothing to point them to.
  assert.equal(await whyLinkEnded(prisma, old, false), "gone");
  // The newer one turned off too: the newest email wouldn't help.
  await prisma.residentLink.update({ where: { id: copied.id }, data: { revokedAt: new Date("2026-11-22T12:00:00Z") } });
  assert.equal(await whyLinkEnded(prisma, old, true), "gone");
  // A newer link for someone else on another lease never counts.
  await prisma.residentLink.create({ data: { tenantId: danaId, leaseId, tokenHash: hashToken(newToken()), createdAt: new Date("2026-11-21T12:00:00Z"), emailedAt: new Date() } });
  assert.equal(await whyLinkEnded(prisma, old, true), "gone");
});
