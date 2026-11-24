import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { sentSince } from "@/lib/notifications/sent-count";
import { scratchRows } from "@/lib/scratch-rows";
import { SIGN_IN_LINK_LIMITS, SIGN_IN_LINK_TTL_MS } from "./limits";
import { changePortalEmailIn, expireResetTokens, expireSignInLinks } from "./accounts-core";
import { findSignInLink, finishSignInLinkTx, requestSignInLinkTx, spendSignInLinkTx } from "./sign-in-link-core";
import { hashToken } from "./tokens";

/**
 * Welcome back's "Email me a sign-in link" against a real database
 * (docs/specs/contractor-scheduled-date.md section 12): a link for the
 * login's own email, 3 an hour, used once, gone after 15 minutes, and never
 * for a login that can't sign in.
 *
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch"); it deletes its rows when it
 * finishes (scratch-rows.ts).
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

/** A contractor login of its own for each test, so one test's requests never count against another's limit. */
async function login(name: string, over: { status?: "ACTIVE" | "DISABLED"; startingPassword?: boolean } = {}) {
  const contact = await made.contact({ fullName: name });
  const account = await prisma.portalAccount.create({
    data: { contactId: contact.id, email: `${name.toLowerCase().replace(/\s+/g, "-")}-${run}@example.test`, passwordHash: "scrypt$x", status: over.status ?? "ACTIVE", mustChangePassword: over.startingPassword ?? false },
  });
  return { contactId: contact.id, accountId: account.id, email: account.email };
}

const ask = (accountId: string, now: Date) => prisma.$transaction((tx) => requestSignInLinkTx(tx, { accountId, ipHash: "ip", now }));
const use = (token: string, now: Date) => prisma.$transaction((tx) => spendSignInLinkTx(tx, token, now));

test("a link goes to the login's own email, opens it once, and spends the login's other links", { skip, timeout }, async () => {
  const zack = await login("Zack Day");
  const now = new Date();
  const first = await ask(zack.accountId, now);
  const second = await ask(zack.accountId, now);
  assert.ok(first && second);
  assert.equal(first.email, zack.email, "never an address typed in");
  assert.equal(first.name, "Zack Day");

  // Opening the page spends nothing (an email scanner opens every link).
  assert.ok(await findSignInLink(prisma, first.token, now));
  assert.ok(await findSignInLink(prisma, first.token, now));

  const used = await use(first.token, now);
  assert.equal(used?.accountId, zack.accountId);
  assert.equal(used?.mustChangePassword, false);
  assert.equal(await use(first.token, now), null, "once");
  assert.equal(await use(second.token, now), null, "an older email can't sign in afterwards");
  assert.equal(await findSignInLink(prisma, first.token, now), null);
});

test("a link works for 15 minutes", { skip, timeout }, async () => {
  const bea = await login("Bea Stone");
  const now = new Date();
  const link = await ask(bea.accountId, now);
  assert.ok(link);
  const late = new Date(now.getTime() + SIGN_IN_LINK_TTL_MS + 1000);
  assert.equal(await findSignInLink(prisma, link.token, late), null);
  assert.equal(await use(link.token, late), null);
  assert.ok(await use(link.token, new Date(now.getTime() + SIGN_IN_LINK_TTL_MS - 1000)), "still good a second before");
});

test("three an hour per login, and the hour rolls", { skip, timeout }, async () => {
  const rob = await login("Rob Lane");
  const now = new Date();
  for (let i = 0; i < SIGN_IN_LINK_LIMITS.perAccount; i++) assert.ok(await ask(rob.accountId, now), `request ${i + 1}`);
  assert.equal(await ask(rob.accountId, now), null, "the fourth in the hour is held back");
  const later = new Date(now.getTime() + SIGN_IN_LINK_LIMITS.windowMs + 1000);
  // The rows are dated by the database's clock, so the window is checked against a time past all of them.
  await prisma.securityEvent.updateMany({
    where: { kind: "SIGN_IN_LINK_REQUESTED", contactId: rob.contactId },
    data: { createdAt: new Date(now.getTime() - SIGN_IN_LINK_LIMITS.windowMs - 1000) },
  });
  assert.ok(await ask(rob.accountId, later));
});

test("no link for a login that can't sign in, and none opens once it's turned off", { skip, timeout }, async () => {
  const off = await login("Off Person", { status: "DISABLED" });
  assert.equal(await ask(off.accountId, new Date()), null);

  const sam = await login("Sam Ortiz");
  const link = await ask(sam.accountId, new Date());
  assert.ok(link);
  await prisma.portalAccount.update({ where: { id: sam.accountId }, data: { status: "DISABLED" } });
  assert.equal(await use(link.token, new Date()), null);
  assert.equal(await use("not-a-token", new Date()), null);
});

const finish = (token: string) => prisma.$transaction((tx) => finishSignInLinkTx(tx, token, "ip", new Date()));

test("a login on its starting password chooses a new one, with no old one asked, and isn't signed in yet", { skip, timeout }, async () => {
  const lee = await login("Lee Hart", { startingPassword: true });
  const link = await ask(lee.accountId, new Date());
  assert.ok(link);
  const result = await finish(link.token);
  assert.equal(result?.kind, "choose-password");
  if (result?.kind !== "choose-password") return;
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(result.resetToken) } });
  assert.equal(reset?.accountId, lee.accountId);
  assert.equal(reset?.usedAt, null);
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: lee.accountId } });
  assert.equal(account.lastSignInAt, null, "not a sign-in yet");
  assert.equal(await finish(link.token), null, "and the sign-in link is spent");
});

test("a login with its own password is signed in, and it counts as a sign-in", { skip, timeout }, async () => {
  const ana = await login("Ana Ruiz");
  const link = await ask(ana.accountId, new Date());
  assert.ok(link);
  const result = await finish(link.token);
  assert.equal(result?.kind, "signed-in");
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: ana.accountId } });
  assert.ok(account.lastSignInAt);
  assert.equal(await prisma.securityEvent.count({ where: { kind: "SIGN_IN_OK", contactId: ana.contactId } }), 1);
});

test("unused links die with an email change, a password change or reset, Remove access and Sign out everywhere", { skip, timeout }, async () => {
  const staff = await made.user({ email: `staff-${run}@example.test`, name: "Connor Swofford", passwordHash: "scrypt$x" });
  const max = await login("Max Webb");
  // An email change: a link mailed to the old inbox dies with it.
  const before = await ask(max.accountId, new Date());
  assert.ok(before);
  await prisma.$transaction((tx) => changePortalEmailIn(tx, max.accountId, `max-new-${run}@example.test`, { id: staff.id }));
  assert.equal(await use(before.token, new Date()), null);
  // A password change, a reset, or Remove access (each calls expireResetTokens).
  const second = await ask(max.accountId, new Date());
  assert.ok(second);
  await expireResetTokens(prisma, max.accountId);
  assert.equal(await use(second.token, new Date()), null);
  // Sign out everywhere (accounts.ts signOutEverywhere), which keeps reset links.
  const third = await ask(max.accountId, new Date());
  assert.ok(third);
  await expireSignInLinks(prisma, max.accountId);
  assert.equal(await use(third.token, new Date()), null);
});

test("a sign-in link email counts against the daily cap once it went", { skip, timeout }, async () => {
  const kim = await login("Kim Park");
  const since = new Date(Date.now() - 60_000);
  const before = await sentSince(prisma, since);
  const link = await ask(kim.accountId, new Date());
  assert.ok(link);
  assert.equal(await sentSince(prisma, since), before, "not until it went");
  await prisma.securityEvent.updateMany({ where: { id: link.eventId }, data: { data: { ...link.data, sent: true } } });
  assert.equal(await sentSince(prisma, since), before + 1);
});
