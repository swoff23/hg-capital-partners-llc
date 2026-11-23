import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { complaintsSince, emailProblemOf, recordDeliveryEvent, type DeliveryEvent } from "./delivery-events";

/**
 * Resend's delivery events on a real Postgres (docs/specs/emails-redesign.md,
 * section 5): a bounce, a suppression and a spam report land on the
 * contractor's login or the partner they went to, a later delivery clears
 * them, a redelivered or late webhook changes nothing, a new address starts
 * clean, and the Job emails switch is never touched.
 *
 * Opt-in like job-emails.pg.test.ts, by the same guard: `npm test` skips it
 * unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name must
 * contain "scratch"); it writes rows there and deletes them when it finishes.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/email/delivery-events.pg.test.ts
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

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
let run: string;
let zackEmail: string;
let accountId: string;
let contactId: string;
let partnerId: string;
let partnerEmail: string;

const T0 = new Date("2026-11-22T15:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const ev = (kind: DeliveryEvent["kind"], to: string, minutes: number): DeliveryEvent => ({ kind, to: [to], at: at(minutes) });

const zack = () =>
  prisma.portalAccount.findUniqueOrThrow({ where: { id: accountId }, select: { email: true, emailProblem: true, emailEventAt: true, emailEventTo: true, jobEmails: true } });
const partner = () => prisma.user.findUniqueOrThrow({ where: { id: partnerId }, select: { email: true, emailProblem: true, emailEventAt: true, emailEventTo: true } });

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = randomUUID().slice(0, 8);
  // No password: a partner to this test only, so other database tests don't email them.
  partnerEmail = `Pieter-${run}@Example.test`;
  partnerId = (await made.user({ email: partnerEmail, name: "Pieter" })).id;
  contactId = (await made.contact({ fullName: "Zack Miller" })).id;
  zackEmail = `zack-${run}@example.test`;
  accountId = (await prisma.portalAccount.create({ data: { contactId, email: zackEmail, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: T0 } })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

test("a bounce lands on the login it went to, once, and never touches the Job emails switch", { skip, timeout }, async () => {
  const first = await recordDeliveryEvent(prisma, ev("bounced", zackEmail, 0));
  assert.deepEqual(first, { kind: "bounced", contactIds: [contactId], userIds: [] });
  assert.deepEqual(await zack(), { email: zackEmail, emailProblem: "BOUNCED", emailEventAt: at(0), emailEventTo: zackEmail, jobEmails: true });
  assert.equal(emailProblemOf(await zack()), "BOUNCED");

  const again = await recordDeliveryEvent(prisma, ev("bounced", zackEmail, 0));
  assert.deepEqual(again.contactIds, [], "Resend's retry of the same event changes nothing");
});

test("a later delivery clears it; a bounce older than that delivery, arriving late, changes nothing", { skip, timeout }, async () => {
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("delivered", zackEmail, -5))).contactIds, [], "a delivery from before the bounce");
  assert.equal((await zack()).emailProblem, "BOUNCED");

  assert.deepEqual((await recordDeliveryEvent(prisma, ev("delivered", zackEmail, 10))).contactIds, [contactId]);
  assert.deepEqual(await zack(), { email: zackEmail, emailProblem: null, emailEventAt: at(10), emailEventTo: zackEmail, jobEmails: true });

  assert.deepEqual((await recordDeliveryEvent(prisma, ev("bounced", zackEmail, 8))).contactIds, [], "a retried bounce from minute 8");
  assert.equal(emailProblemOf(await zack()), null);
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("delivered", zackEmail, 20))).contactIds, [], "nothing to clear: no write");
});

test("a spam report stays put when the next email comes back suppressed, and counts toward the alert for a day", { skip, timeout }, async () => {
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("complained", zackEmail, 30))).contactIds, [contactId]);
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("suppressed", zackEmail, 32))).contactIds, [], "the suppression the complaint caused");
  assert.equal(emailProblemOf(await zack()), "COMPLAINED");
  assert.equal((await zack()).jobEmails, true, "the switch is the partners' call");

  assert.ok((await complaintsSince(prisma, at(29))) >= 1);
  const mine = await prisma.portalAccount.count({ where: { id: accountId, emailProblem: "COMPLAINED", emailEventAt: { gte: at(31) } } });
  assert.equal(mine, 0, "older than the window: no longer counted");
});

test("a suppression with nothing on record is a problem of its own", { skip, timeout }, async () => {
  await recordDeliveryEvent(prisma, ev("delivered", zackEmail, 40));
  assert.equal(emailProblemOf(await zack()), null);
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("suppressed", zackEmail, 41))).contactIds, [contactId]);
  assert.equal(emailProblemOf(await zack()), "SUPPRESSED");
});

test("a new address starts clean, and an event for it applies whatever the old address's times were", { skip, timeout }, async () => {
  const fresh = `zack.new-${run}@example.test`;
  await prisma.portalAccount.update({ where: { id: accountId }, data: { email: fresh } });
  assert.equal(emailProblemOf(await zack()), null, "the old address's suppression no longer counts");
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("bounced", zackEmail, 50))).contactIds, [], "the old address is nobody's now");
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("bounced", fresh, 1))).contactIds, [contactId], "minute 1, older than the old address's last event");
  assert.equal(emailProblemOf(await zack()), "BOUNCED");
  await prisma.portalAccount.update({ where: { id: accountId }, data: { email: zackEmail } });
});

test("a partner's problem is found without case, and an unknown address touches nothing", { skip, timeout }, async () => {
  const change = await recordDeliveryEvent(prisma, { kind: "bounced", to: [partnerEmail.toLowerCase(), `nobody-${run}@example.test`], at: at(60) });
  assert.deepEqual(change, { kind: "bounced", contactIds: [], userIds: [partnerId] });
  assert.equal(emailProblemOf(await partner()), "BOUNCED");
  // `_` in an address is a letter, not LIKE's any-character.
  const lookalike = partnerEmail.toLowerCase().replace("pieter-", "pieter_");
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("delivered", lookalike, 70))).userIds, []);
  assert.equal(emailProblemOf(await partner()), "BOUNCED");
  assert.deepEqual((await recordDeliveryEvent(prisma, ev("delivered", partnerEmail.toLowerCase(), 70))).userIds, [partnerId]);
  assert.equal(emailProblemOf(await partner()), null);
});
