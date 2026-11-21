import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { ResetTokenTaken, RESET_TOKEN_SELECT, findResetOwner, resetTokenOwner, saveStaffReset, usableReset } from "./reset-core";

/**
 * Staff password reset (docs/specs/staff-password-reset.md) on a real
 * Postgres through the app's driver: the token table's one-owner CHECK, who a
 * request reaches, and saveStaffReset's single use, rollback and sign-out
 * stamp. Opt-in like job-batch.pg.test.ts, by the same guard: `npm test`
 * skips it unless HG_SCRATCH_DATABASE_URL names a local scratch database (its
 * name must contain "scratch"). It writes rows there and deletes them when it
 * finishes (scratch-rows.ts).
 *
 *   createdb -h localhost hg_reset_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_reset_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_reset_scratch npx tsx --test src/lib/portal/reset.pg.test.ts
 *   dropdb -h localhost hg_reset_scratch
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
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). */
const made = scratchRows(() => prisma);
let run: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = randomUUID().slice(0, 8);
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

const soon = () => new Date(Date.now() + 30 * 60_000);

async function partner(name: string, passwordHash: string | null = "old.hash") {
  return made.user({ email: `${name}-${run}@example.test`, name, passwordHash });
}

async function staffToken(userId: string, expiresAt = soon()) {
  return prisma.passwordResetToken.create({ data: { userId, tokenHash: `h-${randomUUID()}`, expiresAt } });
}

test("a reset link has exactly one owner", { skip, timeout }, async () => {
  const connor = await partner("connor-owner");
  const contact = await made.contact({ fullName: `Zack ${run}` });
  const zack = await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `zack-owner-${run}@example.test`, passwordHash: "x.y", status: "ACTIVE" },
  });
  const tokenHash = () => `h-${randomUUID()}`;
  await assert.rejects(
    prisma.passwordResetToken.create({ data: { userId: connor.id, accountId: zack.id, tokenHash: tokenHash(), expiresAt: soon() } }),
    /PasswordResetToken_one_owner/,
  );
  await assert.rejects(prisma.passwordResetToken.create({ data: { tokenHash: tokenHash(), expiresAt: soon() } }), /PasswordResetToken_one_owner/);
  // Each kind on its own is fine.
  await prisma.passwordResetToken.create({ data: { ...resetTokenOwner({ kind: "staff", userId: connor.id }), tokenHash: tokenHash(), expiresAt: soon() } });
  await prisma.passwordResetToken.create({ data: { ...resetTokenOwner({ kind: "contractor", accountId: zack.id }), tokenHash: tokenHash(), expiresAt: soon() } });
});

test("Forgot password reaches a partner with a password and not one whose login is off", { skip, timeout }, async () => {
  const connor = await partner("connor-find");
  const off = await partner("off-find", null);
  assert.deepEqual(await findResetOwner(prisma, connor.email), { owner: { kind: "staff", userId: connor.id }, contactId: null, userId: connor.id });
  assert.deepEqual(await findResetOwner(prisma, off.email), { owner: null, contactId: null, userId: off.id });
  assert.deepEqual(await findResetOwner(prisma, `nobody-${run}@example.test`), { owner: null, contactId: null, userId: null });
});

test("a staff reset sets the password, stamps the sign-out time, ends the other links and logs it", { skip, timeout }, async () => {
  const connor = await partner("connor-save");
  const link = await staffToken(connor.id);
  const other = await staffToken(connor.id);
  const now = new Date();

  const row = await prisma.passwordResetToken.findUnique({ where: { id: link.id }, select: RESET_TOKEN_SELECT });
  const reset = usableReset(row, now);
  assert.equal(reset?.kind, "staff");

  await prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: link.id, userId: connor.id, passwordHash: "new.hash", now }));

  const saved = await prisma.user.findUniqueOrThrow({ where: { id: connor.id } });
  assert.equal(saved.passwordHash, "new.hash");
  assert.equal(saved.passwordChangedAt?.getTime(), now.getTime());
  const tokens = await prisma.passwordResetToken.findMany({ where: { id: { in: [link.id, other.id] } } });
  assert.ok(tokens.every((t) => t.usedAt?.getTime() === now.getTime()), "the link is used and the other one ended");
  const events = await prisma.securityEvent.findMany({ where: { kind: "PASSWORD_RESET", userId: connor.id } });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, { by: "email-link" });

  // The same link again: refused, nothing changes.
  await assert.rejects(
    prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: link.id, userId: connor.id, passwordHash: "third.hash", now: new Date() })),
    ResetTokenTaken,
  );
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: connor.id } })).passwordHash, "new.hash");
});

test("only one of two racing submissions of a link wins", { skip, timeout }, async () => {
  const connor = await partner("connor-race");
  const link = await staffToken(connor.id);
  const now = new Date();
  const results = await Promise.allSettled(
    ["a.hash", "b.hash"].map((passwordHash) =>
      prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: link.id, userId: connor.id, passwordHash, now })),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const lost = results.find((r) => r.status === "rejected");
  assert.ok(lost?.status === "rejected" && lost.reason instanceof ResetTokenTaken);
  assert.equal(await prisma.securityEvent.count({ where: { kind: "PASSWORD_RESET", userId: connor.id } }), 1);
});

test("a login turned off after the link was checked keeps its link unused and gets no password", { skip, timeout }, async () => {
  const pieter = await partner("pieter-off");
  const link = await staffToken(pieter.id);
  const now = new Date();
  const checked = usableReset(await prisma.passwordResetToken.findUnique({ where: { id: link.id }, select: RESET_TOKEN_SELECT }), now);
  assert.equal(checked?.kind, "staff");

  // Cleared between the check and the save.
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordHash: null } });
  await assert.rejects(
    prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: link.id, userId: pieter.id, passwordHash: "new.hash", now })),
    ResetTokenTaken,
  );
  const after = await prisma.user.findUniqueOrThrow({ where: { id: pieter.id } });
  assert.equal(after.passwordHash, null);
  assert.equal(after.passwordChangedAt, null);
  // Rolled back whole: the link wasn't spent, though it no longer opens.
  const token = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: link.id }, select: RESET_TOKEN_SELECT });
  assert.equal(token.usedAt, null);
  assert.equal(usableReset(token, now), null);
});

test("an expired staff link is refused", { skip, timeout }, async () => {
  const connor = await partner("connor-expired");
  const link = await staffToken(connor.id, new Date(Date.now() - 1000));
  await assert.rejects(
    prisma.$transaction((tx) => saveStaffReset(tx, { tokenId: link.id, userId: connor.id, passwordHash: "new.hash", now: new Date() })),
    ResetTokenTaken,
  );
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: connor.id } })).passwordHash, "old.hash");
});
