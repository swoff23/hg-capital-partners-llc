import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { deliverResetEmail } from "@/lib/portal/reset-core";
import { sentSince } from "./sent-count";

/**
 * D30's daily count on a real Postgres through the app's driver: outbox rows
 * closed unsent never count, and a password reset counts once its email went
 * (the `sent` flag is a jsonb path filter). Opt-in like job-batch.pg.test.ts,
 * by the same guard: `npm test` skips it unless HG_SCRATCH_DATABASE_URL names
 * a local scratch database (its name must contain "scratch").
 *
 * The count reads the whole table, so the rows here sit in a day of their own
 * in 2199 that nothing else writes to, cleared before and after.
 *
 *   createdb -h localhost hg_count_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_count_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_count_scratch npx tsx --test src/lib/notifications/sent-count.pg.test.ts
 *   dropdb -h localhost hg_count_scratch
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

/** Midnight in Buffalo on a day nothing else writes to; the day before holds rows that mustn't count. */
const DAY = new Date("2199-03-15T04:00:00.000Z");
const BEFORE = new Date("2199-03-14T04:00:00.000Z");
const at = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000);

let prisma: PrismaClient;
/** Every outbox row has one recipient; a partner here. */
let connorId: string;

async function clear() {
  await prisma.notificationOutbox.deleteMany({ where: { sendAfter: { gte: BEFORE } } });
  await prisma.securityEvent.deleteMany({ where: { createdAt: { gte: BEFORE } } });
}

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await clear();
  const run = randomUUID().slice(0, 8);
  connorId = (await prisma.user.create({ data: { email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" } })).id;
});

after(async () => {
  if (skip) return;
  await clear();
  await prisma.$disconnect();
});

test("only emails that went count: rows closed unsent don't, a reset that went does", { skip, timeout }, async () => {
  const row = (sentAt: Date | null, lastError: string | null, attempts = 1) => ({
    recipientUserId: connorId,
    sendAfter: sentAt ?? at(1),
    sentAt,
    lastError,
    attempts,
  });
  await prisma.notificationOutbox.createMany({
    data: [
      row(at(5), null),
      // Closed by the send run without an email going (outbox.ts closeUnsent, the empty bundle, the fifth failure).
      row(at(6), "no login", 0),
      row(at(7), "no access", 0),
      row(at(8), "emails off", 0),
      row(at(9), "nothing to send"),
      row(at(10), "gave up: Resend 500: request failed", 5),
      // Still waiting, and one sent the day before.
      row(null, null, 0),
      row(new Date(DAY.getTime() - 60_000), null),
    ],
  });
  const reset = (createdAt: Date, sent: boolean) => ({ kind: "PASSWORD_RESET_REQUESTED" as const, createdAt, data: { emailHash: "h", sent } });
  await prisma.securityEvent.createMany({ data: [reset(at(11), true), reset(at(12), false), reset(new Date(DAY.getTime() - 60_000), true)] });

  assert.equal(await sentSince(prisma, DAY), 2, "the one outbox email and the one reset that went");
});

test("a reset request counts once its email went, and not when the send fails", { skip, timeout }, async () => {
  const start = await sentSince(prisma, DAY);
  // As reset.ts writes it inside the request's transaction, before anything is sent.
  const data = { emailHash: "zack", sent: false };
  const event = async () => (await prisma.securityEvent.create({ data: { kind: "PASSWORD_RESET_REQUESTED", createdAt: at(20), data } })).id;
  const msg = { to: "zack@example.test", subject: "Reset your HG password", text: "", html: "" };

  const failed = await event();
  assert.equal(await deliverResetEmail(prisma, async () => ({ ok: false, error: "Resend 500: request failed" }), { eventId: failed, data, msg }), false);
  assert.equal(await sentSince(prisma, DAY), start, "a failed send spends nothing");

  const went = await event();
  assert.equal(await deliverResetEmail(prisma, async () => ({ ok: true, id: "re_1" }), { eventId: went, data, msg }), true);
  assert.equal(await sentSince(prisma, DAY), start + 1);
  const row = await prisma.securityEvent.findUniqueOrThrow({ where: { id: went } });
  assert.deepEqual(row.data, { emailHash: "zack", sent: true }, "the rate limit's emailHash stays");
});
